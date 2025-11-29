import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { isValidBitcoinAddress } from '@/lib/formatRange'
import { getRedisClient } from '@/lib/redis'

function extractToken(req: NextRequest): string | null {
	const authHeader = req.headers.get('Authorization')
	if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7)
	return req.headers.get('pool-token')
}

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'POST') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		const token = extractToken(req)
		if (!token) return new Response(JSON.stringify({ error: 'Missing authentication token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

		const userToken = await prisma.userToken.findUnique({ where: { token } })
		if (!userToken) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

		const body = await req.json().catch(() => ({})) as { toAddress?: string, amount?: number }
		const toAddress = String(body?.toAddress || '').trim()
		if (!isValidBitcoinAddress(toAddress)) {
			return new Response(JSON.stringify({ error: 'Invalid destination Bitcoin address' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const availableAgg = await prisma.creditTransaction.aggregate({ where: { userTokenId: userToken.id }, _sum: { amount: true } })
		const available = Number(availableAgg._sum.amount || 0)
		if (!isFinite(available) || available <= 0) {
			return new Response(JSON.stringify({ error: 'No available credits to transfer' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const requestedRaw = Number(body?.amount || 0)
		if (!isFinite(requestedRaw) || requestedRaw <= 0) {
			return new Response(JSON.stringify({ error: 'Invalid amount' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		if (requestedRaw > available) {
			return new Response(JSON.stringify({ error: 'Amount exceeds available credits' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		const requested = Math.floor(requestedRaw * 1000) / 1000

		const nonce = cryptoRandom(24)
		const ts = new Date().toISOString()
		const message = [
			'United Puzzle Pool Credit Transfer',
			`Token: ${userToken.token}`,
			`From: ${userToken.bitcoinAddress}`,
			`To: ${toAddress}`,
			`Amount: ${requested.toFixed(3)}`,
			`Nonce: ${nonce}`,
			`Timestamp: ${ts}`,
		].join('\n')

		const client = await getRedisClient()
		const key = `transfer:${token}:${nonce}`
		const value = JSON.stringify({ token, userTokenId: userToken.id, fromAddress: userToken.bitcoinAddress, toAddress, amount: requested, message, createdAt: ts })
		await client.setEx(key, 15 * 60, value)

		return new Response(JSON.stringify({ message, nonce, amount: requested, fromAddress: userToken.bitcoinAddress, toAddress }), { status: 200, headers: { 'Content-Type': 'application/json' } })

	} catch (error) {
		console.error('Transfer init error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

function cryptoRandom(len: number): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let out = ''
	for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
	return out
}

export const POST = rateLimitMiddleware(handler)
