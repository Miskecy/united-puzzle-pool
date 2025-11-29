import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { parseHexBI, loadPuzzleConfig } from '@/lib/config'
import CoinKey from 'coinkey'

function getSharedSecret(): string { return (process.env.SHARED_POOL_SECRET || '').trim() }
function unauthorized() { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

function toHex64(n: bigint): string { return '0x' + n.toString(16).padStart(64, '0') }

function parsePrivateKeysRaw(raw?: string | null): string[] {
	const s = (raw || '').trim()
	if (!s) return []
	return s.split(/[\s,]+/).filter(Boolean)
}

async function handleGet(req: NextRequest) {
	const secret = getSharedSecret()
	const suppliedSecret = req.headers.get('x-shared-secret') || ''
	const sharedToken = req.headers.get('shared-pool-token') || ''
	let authorized = false
	if (secret && suppliedSecret === secret) {
		authorized = true
	} else if (sharedToken) {
		try {
			const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM shared_pool_tokens WHERE token = ${sharedToken} LIMIT 1`
			authorized = !!(rows && rows[0])
		} catch { authorized = false }
	}
	if (!authorized) return unauthorized()

	const url = new URL(req.url)
	const startHexParam = url.searchParams.get('start') || ''
	const endHexParam = url.searchParams.get('end') || ''
	if (!startHexParam || !endHexParam) {
		return new Response(JSON.stringify({ error: 'Missing start/end' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
	}
	const startBI = parseHexBI(startHexParam)
	const endBI = parseHexBI(endHexParam)
	if (startBI === null || endBI === null || endBI <= startBI) {
		return new Response(JSON.stringify({ error: 'Invalid range' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
	}
	const startHex = toHex64(startBI)
	const endHex = toHex64(endBI)

	const exact = await prisma.blockAssignment.findFirst({
		where: { startRange: startHex, endRange: endHex },
		include: { blockSolution: true },
	})

	if (exact) {
		const priv = parsePrivateKeysRaw(exact.blockSolution?.privateKeys)
		const addrs = JSON.parse(exact.checkworkAddresses || '[]') as string[]
		const status = exact.status === 'COMPLETED' ? 'VALIDATED' : exact.status === 'ACTIVE' ? 'ACTIVE' : 'UNKNOWN'
		return new Response(JSON.stringify({ status, checkwork_addresses: addrs, privatekeys: priv, blockId: exact.id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	}

	const overlaps = await prisma.blockAssignment.findMany({
		where: { status: 'COMPLETED' },
		include: { blockSolution: true },
		orderBy: { createdAt: 'desc' },
		take: 100,
	})
	const matched = overlaps.filter(b => {
		try {
			const s = parseHexBI(b.startRange) ?? 0n
			const e = parseHexBI(b.endRange) ?? 0n
			return s <= startBI! && e >= endBI!
		} catch { return false }
	})
	if (matched.length > 0) {
		const m = matched[0]
		const priv = parsePrivateKeysRaw(m.blockSolution?.privateKeys)
		const addrs = JSON.parse(m.checkworkAddresses || '[]') as string[]
		return new Response(JSON.stringify({ status: 'VALIDATED', checkwork_addresses: addrs, privatekeys: priv, blockId: m.id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	}
	const partial = overlaps.map(b => {
		try {
			const s = parseHexBI(b.startRange) ?? 0n
			const e = parseHexBI(b.endRange) ?? 0n
			const ps = s > startBI! ? s : startBI!
			const pe = e < endBI! ? e : endBI!
			const addrs = JSON.parse(b.checkworkAddresses || '[]') as string[]
			const priv = parsePrivateKeysRaw(b.blockSolution?.privateKeys)
			return { start: ps, end: pe, id: b.id, addrs, priv }
		} catch { return { start: 0n, end: 0n, id: b.id, addrs: [] as string[], priv: [] as string[] } }
	}).filter(x => x.end > x.start)
	if (partial.length > 0) {
		const sorted = partial.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
		const merged: { start: bigint; end: bigint }[] = []
		for (const seg of sorted) {
			const last = merged[merged.length - 1]
			if (!last || seg.start > last.end) { merged.push({ start: seg.start, end: seg.end }) }
			else if (seg.end > last.end) { last.end = seg.end }
		}
		const total = merged.reduce((acc, cur) => acc + (cur.end - cur.start), 0n)
		const denom = endBI! - startBI!
		const pct = denom > 0n ? Number((total * 10000n) / denom) / 100 : 0
		const segments = merged.map(m => ({ start: toHex64(m.start), end: toHex64(m.end) }))
		const addrSet = new Set<string>()
		const privSet = new Set<string>()
		for (const p of partial) { for (const a of p.addrs) addrSet.add(a); for (const v of p.priv) privSet.add(v) }
		const addrsAgg = Array.from(addrSet)
		const privAgg = Array.from(privSet)
		const ids = partial.map(p => p.id)
		return new Response(JSON.stringify({ status: 'PARTIAL', coverage_percent: pct, segments, checkwork_addresses: addrsAgg, privatekeys: privAgg, blockIds: ids }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	}
	return new Response(JSON.stringify({ status: 'NOT_FOUND', checkwork_addresses: [], privatekeys: [] }), { status: 404, headers: { 'Content-Type': 'application/json' } })
}

async function handlePost(req: NextRequest) {
	const secret = getSharedSecret()
	const suppliedSecret = req.headers.get('x-shared-secret') || ''
	const sharedToken = req.headers.get('shared-pool-token') || ''
	let authorized = false
	let sharedTokenId: string | null = null
	if (secret && suppliedSecret === secret) {
		authorized = true
	} else if (sharedToken) {
		try {
			const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM shared_pool_tokens WHERE token = ${sharedToken} LIMIT 1`
			authorized = !!(rows && rows[0])
			sharedTokenId = rows && rows[0] ? rows[0].id : null
		} catch { authorized = false }
	}
	if (!authorized) return unauthorized()

	let body: unknown
	try {
		body = await req.json()
	} catch { return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }

	const data = body as {
		startRange?: string
		endRange?: string
		checkworks_addresses?: string[]
		privatekeys?: string[] | string
		poolname?: string
		puzzleaddress?: string
	}

	const startBI = parseHexBI(data.startRange || '')
	const endBI = parseHexBI(data.endRange || '')
	if (startBI === null || endBI === null || endBI <= startBI) {
		return new Response(JSON.stringify({ error: 'Invalid range' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
	}
	const startHex = toHex64(startBI)
	const endHex = toHex64(endBI)
	const addrs = Array.isArray(data.checkworks_addresses) ? data.checkworks_addresses.filter(a => !!a) : []
	const privLower = Array.isArray(data.privatekeys) ? data.privatekeys : typeof data.privatekeys === 'string' ? data.privatekeys.split(/[\s,]+/).filter(Boolean) : []
	const maybePrivKeys = (data as { privateKeys?: string[] | string }).privateKeys
	const privUpper = Array.isArray(maybePrivKeys) ? maybePrivKeys : typeof maybePrivKeys === 'string' ? maybePrivKeys.split(/[\s,]+/).filter(Boolean) : []
	const privArr = [...privLower, ...privUpper].filter(Boolean)
	const puzzleAddress = (data.puzzleaddress || '').trim() || null

	const cfg = await loadPuzzleConfig()
	const nameSnap = `Shared Pool`
	const addrSnap = puzzleAddress || cfg?.address || null

	// validate private keys format, range, and coverage of checkwork addresses
	const strip0x = (hex: string) => hex.startsWith('0x') ? hex.slice(2) : hex
	const isHex64 = (s: string) => /^[0-9a-fA-F]{64}$/.test(s)
	const derivedAddresses: string[] = []
	for (let i = 0; i < privArr.length; i++) {
		const raw = String(privArr[i] || '')
		const clean = strip0x(raw)
		if (!isHex64(clean)) {
			return new Response(JSON.stringify({ error: 'Invalid private key format', index: i }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		let bi: bigint
		try { bi = BigInt('0x' + clean) } catch {
			return new Response(JSON.stringify({ error: 'Invalid private key number', index: i }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		if (!(bi >= startBI && bi <= endBI)) {
			return new Response(JSON.stringify({ error: 'Private key out of range', index: i }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		try {
			const address = new CoinKey(Buffer.from(clean, 'hex')).publicAddress
			derivedAddresses.push(address)
		} catch {
			return new Response(JSON.stringify({ error: 'Failed to derive address from private key', index: i }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
	}
	const missing = addrs.filter(a => !derivedAddresses.some(d => d === a))
	if (missing.length > 0) {
		return new Response(JSON.stringify({ error: 'Not all checkwork addresses covered by private keys', details: { expected: addrs, derived: derivedAddresses, missing } }), { status: 400, headers: { 'Content-Type': 'application/json' } })
	}

	// ensure a corresponding user token exists keyed by the shared pool token string
	let user = await prisma.userToken.findUnique({ where: { token: sharedToken } })
	if (!user) {
		const addrForUser = addrSnap || cfg?.address || 'shared-pool'
		user = await prisma.userToken.create({ data: { token: sharedToken, bitcoinAddress: String(addrForUser) } })
	}
	const userTokenId = user.id

	const existing = await prisma.blockAssignment.findFirst({ where: { startRange: startHex, endRange: endHex, userTokenId } })
	let assignmentId: string
	if (existing) {
		const updated = await prisma.blockAssignment.update({ where: { id: existing.id }, data: { status: 'COMPLETED', checkworkAddresses: JSON.stringify(addrs), puzzleAddressSnapshot: addrSnap || undefined, puzzleNameSnapshot: nameSnap, sharedPoolTokenId: sharedTokenId || undefined, expiresAt: new Date() } })
		assignmentId = updated.id
	} else {
		const created = await prisma.blockAssignment.create({
			data: {
				userTokenId,
				startRange: startHex,
				endRange: endHex,
				checkworkAddresses: JSON.stringify(addrs),
				status: 'COMPLETED',
				expiresAt: new Date(),
				puzzleAddressSnapshot: addrSnap || undefined,
				puzzleNameSnapshot: nameSnap,
				sharedPoolTokenId: sharedTokenId || undefined,
			}
		})
		assignmentId = created.id
	}

	const privRaw = privArr.join('\n')
	const existingSolution = await prisma.blockSolution.findUnique({ where: { blockAssignmentId: assignmentId } })
	if (existingSolution) {
		await prisma.blockSolution.update({ where: { blockAssignmentId: assignmentId }, data: { privateKeys: privRaw, creditsAwarded: 0, puzzlePrivateKey: null } })
	} else {
		await prisma.blockSolution.create({ data: { blockAssignmentId: assignmentId, privateKeys: privRaw, creditsAwarded: 0, puzzlePrivateKey: null } })
	}

	return new Response(JSON.stringify({ ok: true, id: assignmentId }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function handler(req: NextRequest) {
	// require shared API be enabled in app_config
	try {
		const rows = await prisma.$queryRaw<{ shared_pool_api_enabled: number }[]>`
      SELECT shared_pool_api_enabled FROM app_config WHERE id = 'singleton' LIMIT 1
    `
		const enabled = rows && rows[0] ? !!rows[0].shared_pool_api_enabled : false
		if (!enabled) {
			return new Response(JSON.stringify({ error: 'Shared API disabled' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
		}
	} catch { }
	if (req.method === 'GET') return handleGet(req)
	if (req.method === 'POST') return handlePost(req)
	return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export const GET = rateLimitMiddleware(handler)
export const POST = rateLimitMiddleware(handler)
