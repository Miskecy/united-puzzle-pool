import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import CoinKey from 'coinkey'
import { formatCompactHexRange } from '@/lib/formatRange'

async function handler(req: NextRequest, { params }: { params: { id: string } }) {
	try {
		if (req.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		const id = params?.id || ''
		if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

		const block = await prisma.blockAssignment.findUnique({
			where: { id },
			include: {
				userToken: { select: { token: true, bitcoinAddress: true } },
				blockSolution: { select: { id: true, privateKeys: true, creditsAwarded: true, createdAt: true, puzzlePrivateKey: true } },
			},
		})

		if (!block) {
			return new Response(JSON.stringify({ error: 'Block not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
		}

		const startRaw = block.startRange
		const endRaw = block.endRange
		const startHex = formatCompactHexRange(block.startRange)
		const endHex = formatCompactHexRange(block.endRange)
		const assignedAt = block.createdAt
		const completedAt = block.blockSolution?.createdAt || null
		const durationSeconds = completedAt ? Math.max(1, Math.floor((completedAt.getTime() - assignedAt.getTime()) / 1000)) : null
		const keysValidatedBI = BigInt(endRaw) - BigInt(startRaw)
		const keysValidated = Number(keysValidatedBI > 0n ? keysValidatedBI : 0n)
		const avgSpeed = durationSeconds && durationSeconds > 0 ? keysValidated / durationSeconds : null
		const token = block.userToken?.token || ''
		const tokenMasked = token ? `${token.slice(0, 6)}…${token.slice(Math.max(0, token.length - 6))}` : ''
		const checkworkAddresses = (() => { try { return JSON.parse(block.checkworkAddresses) as string[] } catch { return [] as string[] } })()
		const privateKeysRaw = (() => { try { return JSON.parse(block.blockSolution?.privateKeys || '[]') as string[] } catch { return [] as string[] } })()

		// Derive addresses from private keys and compute matches
		const stripHex = (hex: string) => hex.startsWith('0x') ? hex.slice(2) : hex
		const derivedMap = privateKeysRaw.map((pk) => {
			try {
				const clean = stripHex(pk)
				const address = new CoinKey(Buffer.from(clean, 'hex')).publicAddress
				return { privateKey: pk, address }
			} catch {
				return { privateKey: pk, address: '' }
			}
		})
		const cwSet = new Set(checkworkAddresses)
		const privateKeys = privateKeysRaw
		const puzzleKey = block.blockSolution?.puzzlePrivateKey || null
		const addressMap = derivedMap.map(({ privateKey, address }) => ({ privateKey: puzzleKey && privateKey === puzzleKey ? undefined : privateKey, address, isValid: cwSet.has(address) }))
		const matchedCount = addressMap.filter(a => a.isValid).length
		const missingAddresses = checkworkAddresses.filter(a => !addressMap.some(m => m.address === a))

		const data = {
			id: block.id,
			bitcoinAddress: block.userToken?.bitcoinAddress || '',
			tokenMasked,
			hexRangeStart: startHex,
			hexRangeEnd: endHex,
			hexRangeStartRaw: startRaw,
			hexRangeEndRaw: endRaw,
			assignedAt,
			completedAt,
			durationSeconds,
			keysValidated,
			avgSpeedKeysPerSec: avgSpeed,
			creditsAwarded: Number(block.blockSolution?.creditsAwarded || 0) / 1000,
			checkworkAddresses,
			privateKeys,
			addressMap,
			matchedCount,
			missingAddresses,
		}

		return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
	} catch {
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => ctx.params.then(p => rateLimitMiddleware((r) => handler(r, { params: p }))(req))
