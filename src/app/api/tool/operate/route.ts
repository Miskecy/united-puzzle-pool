import { NextRequest } from 'next/server'
import CoinKey from 'coinkey'
import * as cs from 'coinstring'
import crypto from 'crypto'
import bs58 from 'bs58'
import secp256k1 from 'secp256k1'

function strip0x(s: string) {
	return s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s
}

function isHex(s: string) {
	return /^[0-9a-fA-F]+$/.test(strip0x(s))
}

function toBytes(input: string) {
	const t = input.trim()
	if (isHex(t)) return Buffer.from(strip0x(t), 'hex')
	return Buffer.from(t, 'utf8')
}

function fromBytesHex(buf: Buffer) {
	return buf.toString('hex')
}

function sha256Bytes(buf: Buffer) {
	return crypto.createHash('sha256').update(buf).digest()
}

function ripemd160Bytes(buf: Buffer) {
	try {
		return crypto.createHash('rmd160').update(buf).digest()
	} catch {
		return crypto.createHash('ripemd160').update(buf).digest()
	}
}

function sha3_256Bytes(buf: Buffer) {
	try {
		return crypto.createHash('sha3-256').update(buf).digest()
	} catch {
		return sha256Bytes(buf)
	}
}

function addressFromPub(pub: Buffer) {
	const h = ripemd160Bytes(sha256Bytes(pub))
	return cs.encode(h, 0x00)
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

function operate(op: string, line: string): string {
	switch (op) {
		case 'dec_to_hex': {
			const v = BigInt(line.trim())
			return v.toString(16)
		}
		case 'hex_to_dec': {
			const v = BigInt('0x' + strip0x(line.trim()))
			return v.toString(10)
		}
		case 'bin_to_hex': {
			const v = BigInt('0b' + line.trim())
			return v.toString(16)
		}
		case 'hex_to_bin': {
			const v = BigInt('0x' + strip0x(line.trim()))
			return v.toString(2)
		}
		case 'ascii_to_hex': {
			return Buffer.from(line, 'utf8').toString('hex')
		}
		case 'hex_to_ascii': {
			const clean = strip0x(line)
			if (!isHex(clean) || clean.length % 2 !== 0) throw new Error('Hex input required')
			return Buffer.from(clean, 'hex').toString('utf8')
		}
		case 'base58_enc': {
			const b = toBytes(line)
			return bs58.encode(b)
		}
		case 'base58_dec': {
			const b = bs58.decode(line.trim())
			return Buffer.from(b).toString('hex')
		}
		case 'base58check_enc': {
			const b = toBytes(line)
			return cs.encode(b, 0x00)
		}
		case 'base58check_dec': {
			const b = cs.decode(line.trim())
			const payload = Buffer.from(b.slice(1))
			return payload.toString('hex')
		}
		case 'sha256': {
			return fromBytesHex(sha256Bytes(toBytes(line)))
		}
		case 'ripemd160': {
			return fromBytesHex(ripemd160Bytes(toBytes(line)))
		}
		case 'hash160': {
			const sha = sha256Bytes(toBytes(line))
			return fromBytesHex(ripemd160Bytes(sha))
		}
		case 'keccak256': {
			return fromBytesHex(sha3_256Bytes(toBytes(line)))
		}
		case 'priv_to_pubc': {
			const clean = strip0x(line)
			if (!isHex(clean) || clean.length !== 64) throw new Error('Private key must be 64 hex chars')
            const ck = newCoinKey(Buffer.from(clean, 'hex'))
			ck.compressed = true
			return Buffer.from(ck.publicKey).toString('hex')
		}
		case 'priv_to_pubu': {
			const clean = strip0x(line)
			if (!isHex(clean) || clean.length !== 64) throw new Error('Private key must be 64 hex chars')
            const ck = newCoinKey(Buffer.from(clean, 'hex'))
			ck.compressed = false
			return Buffer.from(ck.publicKey).toString('hex')
		}
		case 'priv_to_wifc': {
			const clean = strip0x(line)
			if (!isHex(clean) || clean.length !== 64) throw new Error('Private key must be 64 hex chars')
            const ck = newCoinKey(Buffer.from(clean, 'hex'))
			ck.compressed = true
			return ck.privateWif
		}
		case 'priv_to_wifu': {
			const clean = strip0x(line)
			if (!isHex(clean) || clean.length !== 64) throw new Error('Private key must be 64 hex chars')
            const ck = newCoinKey(Buffer.from(clean, 'hex'))
			ck.compressed = false
			return ck.privateWif
		}
		case 'wif_to_priv': {
            const ck = coinKeyFromWif(line.trim())
			return ck.privateKey.toString('hex')
		}
		case 'priv_to_addrc': {
			const clean = strip0x(line)
			if (!isHex(clean) || clean.length !== 64) throw new Error('Private key must be 64 hex chars')
            const ck = newCoinKey(Buffer.from(clean, 'hex'))
			ck.compressed = true
			return ck.publicAddress
		}
		case 'priv_to_addru': {
			const clean = strip0x(line)
			if (!isHex(clean) || clean.length !== 64) throw new Error('Private key must be 64 hex chars')
            const ck = newCoinKey(Buffer.from(clean, 'hex'))
			ck.compressed = false
			return ck.publicAddress
		}
		case 'pub_to_pubc': {
			const clean = strip0x(line)
			if (!isHex(clean)) throw new Error('Hex public key required')
			const buf = Buffer.from(clean, 'hex')
			if (!(buf.length === 65 || buf.length === 33)) throw new Error('Public key must be 33 or 65 bytes')
			const c = secp256k1.publicKeyConvert(buf, true)
			return Buffer.from(c).toString('hex')
		}
		case 'pub_to_pubu': {
			const clean = strip0x(line)
			if (!isHex(clean)) throw new Error('Hex public key required')
			const buf = Buffer.from(clean, 'hex')
			if (!(buf.length === 65 || buf.length === 33)) throw new Error('Public key must be 33 or 65 bytes')
			const u = secp256k1.publicKeyConvert(buf, false)
			return Buffer.from(u).toString('hex')
		}
		case 'pub_to_addr': {
			const clean = strip0x(line)
			if (!isHex(clean)) throw new Error('Hex public key required')
			const buf = Buffer.from(clean, 'hex')
			if (!(buf.length === 65 || buf.length === 33)) throw new Error('Public key must be 33 or 65 bytes')
			return addressFromPub(buf)
		}
		case 'pub_to_addrc': {
			const clean = strip0x(line)
			if (!isHex(clean)) throw new Error('Hex public key required')
			const buf = Buffer.from(clean, 'hex')
			if (!(buf.length === 65 || buf.length === 33)) throw new Error('Public key must be 33 or 65 bytes')
			const c = secp256k1.publicKeyConvert(buf, true)
			return addressFromPub(Buffer.from(c))
		}
		case 'addr_to_hash160': {
			const b = cs.decode(line.trim())
			const payload = Buffer.from(b.slice(1))
			return payload.toString('hex')
		}
		default:
			return ''
	}
}

async function handler(req: NextRequest) {
	if (req.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
	}
	try {
		const body = await req.json()
		const op: string = body?.op
		const input: string = body?.input || ''
		if (!op) {
			return new Response(JSON.stringify({ error: 'Missing op' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		const lines = input.split('\n').map(s => s)
		const outputs: string[] = []
		const errors: (string | null)[] = []
		for (const l of lines) {
			try {
				const out = operate(op, l)
				outputs.push(out)
				errors.push(null)
			} catch (e) {
				outputs.push('')
				const msg = e instanceof Error ? e.message : 'Invalid input'
				errors.push(msg)
			}
		}
		return new Response(JSON.stringify({ outputs, errors }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch {
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
}

export const POST = handler
