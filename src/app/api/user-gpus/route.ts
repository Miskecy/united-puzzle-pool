import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

type UserGpuSubmission = {
	id: string
	model: string
	approx_keys_per_second_mkeys: number
	tdp_w?: number
	brand?: string
	architecture?: string
	series?: string
	createdAt: string
	status: 'PENDING' | 'APPROVED' | 'DENIED'
}

function dataFile(): string {
	return path.join(process.cwd(), 'src', 'data', 'user-gpus.json')
}

async function readAll(): Promise<UserGpuSubmission[]> {
	try {
		const fp = dataFile()
		const buf = await fs.readFile(fp)
		const j = JSON.parse(buf.toString())
		return Array.isArray(j) ? (j as UserGpuSubmission[]) : []
	} catch {
		return []
	}
}

async function writeAll(items: UserGpuSubmission[]): Promise<void> {
	const fp = dataFile()
	await fs.mkdir(path.dirname(fp), { recursive: true })
	await fs.writeFile(fp, JSON.stringify(items, null, 2))
}

function getSecret(): string { return (process.env.SETUP_SECRET || '').trim() }

async function handler(req: NextRequest) {
	if (req.method === 'GET') {
		const secret = getSecret()
		const supplied = req.headers.get('x-setup-secret') || ''
		const cookie = req.headers.get('cookie') || ''
		const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
		const isAdmin = secret ? (hasSession || supplied === secret) : true
		const items = await readAll()
		const result = isAdmin ? items : items.filter(i => i.status === 'APPROVED')
		return new Response(JSON.stringify({ items: result }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	}

	if (req.method === 'POST') {
		try {
			const body = await req.json()
			const model = String(body?.model || '').trim()
			const speed = Number(body?.approx_keys_per_second_mkeys || 0)
			const tdp = body?.tdp_w !== undefined ? Number(body.tdp_w) : undefined
			const brand = body?.brand ? String(body.brand) : undefined
			const architecture = body?.architecture ? String(body.architecture) : undefined
			const series = body?.series ? String(body.series) : undefined
			if (!model || !isFinite(speed) || speed <= 0) {
				return new Response(JSON.stringify({ error: 'Invalid model or speed' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
			}
			const items = await readAll()
			const sub: UserGpuSubmission = {
				id: randomUUID(),
				model,
				approx_keys_per_second_mkeys: speed,
				tdp_w: tdp,
				brand,
				architecture,
				series,
				createdAt: new Date().toISOString(),
				status: 'PENDING',
			}
			items.push(sub)
			await writeAll(items)
			return new Response(JSON.stringify(sub), { status: 200, headers: { 'Content-Type': 'application/json' } })
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
	}

	return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export const GET = rateLimitMiddleware(handler)
export const POST = rateLimitMiddleware(handler)
