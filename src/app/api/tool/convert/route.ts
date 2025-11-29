import { NextRequest } from 'next/server'
import CoinKey from 'coinkey'
import * as cs from 'coinstring'
import crypto from 'crypto'
import secp256k1 from 'secp256k1'

type ConversionResult = {
	privateKeyHex: string | null
	publicKeyCompressedHex: string
	publicKeyUncompressedHex: string
	wifCompressed: string | null
	wifUncompressed: string | null
	addressCompressed: string
	addressUncompressed: string
} | null

function isHex(s: string) {
	return /^[0-9a-fA-F]+$/.test(s)
}

function strip0x(s: string) {
	return s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s
}

type CoinKeyLike = {
    privateKey: Buffer
    publicKey: Buffer
    privateWif: string
    publicAddress: string
    compressed: boolean
}

function newCoinKey(buf: Buffer): CoinKeyLike {
    const Ctor = CoinKey as unknown as { new (b: Buffer): unknown }
    return new Ctor(buf) as CoinKeyLike
}

function coinKeyFromWif(wif: string): CoinKeyLike {
    const mod = CoinKey as unknown as { fromWif(w: string): unknown }
    return mod.fromWif(wif) as CoinKeyLike
}

function pubkeyHash(pub: Buffer) {
	const sha = crypto.createHash('sha256').update(pub).digest()
	try {
		return crypto.createHash('rmd160').update(sha).digest()
	} catch {
		return crypto.createHash('ripemd160').update(sha).digest()
	}
}

function addressFromPub(pub: Buffer) {
	const h = pubkeyHash(pub)
	return cs.encode(h, 0x00)
}

function resultFromPrivateKey(buf: Buffer) {
    const ck = newCoinKey(buf)
	ck.compressed = true
	const pubC = Buffer.from(ck.publicKey)
	const wifC = ck.privateWif
	const addrC = ck.publicAddress
	ck.compressed = false
	const pubU = Buffer.from(ck.publicKey)
	const wifU = ck.privateWif
	const addrU = ck.publicAddress
	return {
		privateKeyHex: buf.toString('hex'),
		publicKeyCompressedHex: pubC.toString('hex'),
		publicKeyUncompressedHex: pubU.toString('hex'),
		wifCompressed: wifC,
		wifUncompressed: wifU,
		addressCompressed: addrC,
		addressUncompressed: addrU,
	}
}

function resultFromWif(wif: string) {
    const ck = coinKeyFromWif(wif)
	const pkHex = ck.privateKey.toString('hex')
	ck.compressed = true
	const pubC = Buffer.from(ck.publicKey)
	const wifC = ck.privateWif
	const addrC = ck.publicAddress
	ck.compressed = false
	const pubU = Buffer.from(ck.publicKey)
	const wifU = ck.privateWif
	const addrU = ck.publicAddress
	return {
		privateKeyHex: pkHex,
		publicKeyCompressedHex: pubC.toString('hex'),
		publicKeyUncompressedHex: pubU.toString('hex'),
		wifCompressed: wifC,
		wifUncompressed: wifU,
		addressCompressed: addrC,
		addressUncompressed: addrU,
	}
}

function resultFromPublicKey(hex: string) {
	const clean = strip0x(hex)
	const buf = Buffer.from(clean, 'hex')
	let pubC: Buffer | null = null
	let pubU: Buffer | null = null
	if (buf.length === 33 && (buf[0] === 0x02 || buf[0] === 0x03)) {
		const u = secp256k1.publicKeyConvert(buf, false)
		pubC = buf
		pubU = Buffer.from(u)
	} else if (buf.length === 65 && buf[0] === 0x04) {
		const c = secp256k1.publicKeyConvert(buf, true)
		pubU = buf
		pubC = Buffer.from(c)
	} else {
		return null
	}
	const addrC = addressFromPub(pubC)
	const addrU = addressFromPub(pubU)
	return {
		privateKeyHex: null,
		publicKeyCompressedHex: pubC.toString('hex'),
		publicKeyUncompressedHex: pubU.toString('hex'),
		wifCompressed: null,
		wifUncompressed: null,
		addressCompressed: addrC,
		addressUncompressed: addrU,
	}
}

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'POST') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}
		const body = await req.json()
		const raw: string = (body?.input || '').trim()
		if (!raw) {
			return new Response(JSON.stringify({ error: 'Missing input' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		const hexCandidate = strip0x(raw)
		let result: ConversionResult = null
		let inputType: string = 'unknown'
		if (isHex(hexCandidate)) {
			if (hexCandidate.length === 64) {
				const buf = Buffer.from(hexCandidate, 'hex')
				result = resultFromPrivateKey(buf)
				inputType = 'privateKey'
			} else if (hexCandidate.length === 66 && (hexCandidate.startsWith('02') || hexCandidate.startsWith('03'))) {
				result = resultFromPublicKey(hexCandidate)
				inputType = 'publicKeyCompressed'
			} else if (hexCandidate.length === 130 && hexCandidate.startsWith('04')) {
				result = resultFromPublicKey(hexCandidate)
				inputType = 'publicKeyUncompressed'
			}
		}
		if (!result) {
			try {
				result = resultFromWif(raw)
				inputType = 'wif'
			} catch { }
		}
		if (!result) {
			return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		return new Response(JSON.stringify({ inputType, ...result }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch {
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
}

export const POST = handler
