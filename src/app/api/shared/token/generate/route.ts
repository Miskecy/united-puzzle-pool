import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { generateRandomToken } from '@/lib/utils'
import crypto from 'crypto'

async function findByPoolName(poolname: string) {
	const rows = await prisma.$queryRaw<{ id: string, token: string }[]>`
    SELECT id, token FROM shared_pool_tokens WHERE pool_name = ${poolname} LIMIT 1
  `
	return rows && rows[0] ? rows[0] : null
}

async function insertToken(id: string, token: string, poolname: string, puzzleaddress: string | null) {
	const now = new Date().toISOString()
	await prisma.$executeRaw`
    INSERT INTO shared_pool_tokens (id, token, pool_name, puzzle_address, created_at, updated_at)
    VALUES (${id}, ${token}, ${poolname}, ${puzzleaddress}, ${now}, ${now})
  `
}

async function updateToken(id: string, token: string) {
	const now = new Date().toISOString()
	await prisma.$executeRaw`
    UPDATE shared_pool_tokens SET token = ${token}, updated_at = ${now} WHERE id = ${id}
  `
}

async function handler(req: NextRequest) {
	if (req.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
	}
	try {
		const body = await req.json()
		const puzzleaddressRaw: string | null = (body?.puzzleaddress ? String(body.puzzleaddress).trim() : null) || null
		if (!puzzleaddressRaw) {
			return new Response(JSON.stringify({ error: 'Missing puzzleaddress' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		const exists = await prisma.puzzleConfig.findFirst({ where: { puzzleAddress: puzzleaddressRaw } })
		if (!exists) {
			return new Response(JSON.stringify({ error: 'Puzzle address not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
		}

		const id = crypto.randomBytes(16).toString('hex')
		const token = generateRandomToken(64)

		const existing = await findByPoolName('shared')
		if (existing) {
			await updateToken(existing.id, token)
			return new Response(JSON.stringify({ token }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		}

		await insertToken(id, token, 'shared', puzzleaddressRaw)
		return new Response(JSON.stringify({ token }), { status: 201, headers: { 'Content-Type': 'application/json' } })
	} catch {
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const POST = rateLimitMiddleware(handler)
