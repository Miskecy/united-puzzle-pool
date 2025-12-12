import { NextRequest } from 'next/server'
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

function dataDir(): string {
    const env = (process.env.DATA_DIR || '').trim()
    return env ? env : path.join(process.cwd(), 'src', 'data')
}

function dataFile(): string {
    return path.join(dataDir(), 'user-gpus.json')
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

async function handler(req: NextRequest, { params }: { params: { id: string } }) {
	const secret = getSecret()
	const supplied = req.headers.get('x-setup-secret') || ''
	const cookie = req.headers.get('cookie') || ''
	const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
	if (secret) {
		if (!(hasSession || supplied === secret)) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
		}
	}

	if (req.method === 'PATCH') {
		try {
			const body = await req.json()
			const action = String(body?.action || '').toLowerCase()
			const id = params.id
			const items = await readAll()
			const idx = items.findIndex(i => i.id === id)
			if (idx < 0) {
				return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
			}
            
			if (action === 'approve') {
				items[idx].status = 'APPROVED'
				await writeAll(items)
				return new Response(JSON.stringify(items[idx]), { status: 200, headers: { 'Content-Type': 'application/json' } })
			}
			if (action === 'deny') {
				items[idx].status = 'DENIED'
				await writeAll(items)
				return new Response(JSON.stringify(items[idx]), { status: 200, headers: { 'Content-Type': 'application/json' } })
			}
			return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
	}

	return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const params = await ctx.params
    return handler(req, { params })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const params = await ctx.params
    const secret = getSecret()
    const supplied = req.headers.get('x-setup-secret') || ''
    const cookie = req.headers.get('cookie') || ''
    const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
    if (secret) {
        if (!(hasSession || supplied === secret)) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
        }
    }
    try {
        const id = params.id
        const items = await readAll()
        const idx = items.findIndex(i => i.id === id)
        if (idx < 0) {
            return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
        }
        items.splice(idx, 1)
        await writeAll(items)
        return new Response(JSON.stringify({ ok: true, id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch {
        return new Response(JSON.stringify({ error: 'Failed to delete' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
}
