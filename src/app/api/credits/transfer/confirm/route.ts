import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { getRedisClient } from '@/lib/redis'
import * as bitcoinMessage from 'bitcoinjs-message'

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

		const body = await req.json().catch(() => ({})) as { nonce?: string, signature?: string }
		const nonce = String(body?.nonce || '').trim()
		const signature = String(body?.signature || '').trim()
		if (!nonce || !signature) {
			return new Response(JSON.stringify({ error: 'Missing nonce or signature' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const client = await getRedisClient()
		const key = `transfer:${token}:${nonce}`
		const raw = await client.get(key)
		if (!raw) {
			return new Response(JSON.stringify({ error: 'Transfer session expired or invalid' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		const data = JSON.parse(raw) as { token: string, userTokenId: string, fromAddress: string, toAddress: string, amount: number, message: string }

		const ok = bitcoinMessage.verify(data.message, data.fromAddress, signature)
		if (!ok) {
			return new Response(JSON.stringify({ error: 'Signature verification failed' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const userToken = await prisma.userToken.findUnique({ where: { id: data.userTokenId } })
		if (!userToken || userToken.token !== token) {
			return new Response(JSON.stringify({ error: 'Invalid token or user session' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
		}

		const availableAgg = await prisma.creditTransaction.aggregate({ where: { userTokenId: userToken.id }, _sum: { amount: true } })
		const availableMu = Number(availableAgg._sum.amount || 0)
		const requestedMu = Math.round(Number(data.amount || 0) * 1000)
		const amountMu = Math.min(requestedMu, availableMu)
		if (!isFinite(amountMu) || amountMu <= 0) {
			return new Response(JSON.stringify({ error: 'No credits available' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const spent = await prisma.creditTransaction.create({
			data: {
				userTokenId: userToken.id,
				type: 'SPENT',
				amount: -amountMu,
				description: `Transfer to ${data.toAddress} (nonce ${nonce})`,
			}
		})

		await client.del(key)

		const afterAgg = await prisma.creditTransaction.aggregate({ where: { userTokenId: userToken.id }, _sum: { amount: true } })
		const newAvailableMu = Number(afterAgg._sum.amount || 0)

		return new Response(JSON.stringify({ success: true, spentAmount: amountMu / 1000, newAvailableCredits: newAvailableMu / 1000, transactionId: spent.id }), { status: 200, headers: { 'Content-Type': 'application/json' } })

	} catch (error) {
		console.error('Transfer confirm error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const POST = rateLimitMiddleware(handler)
