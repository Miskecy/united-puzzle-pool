import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'

function getSecret(): string { return (process.env.SETUP_SECRET || '').trim() }
function unauthorized() { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

async function handler(req: NextRequest) {
  const secret = getSecret()
  if (!secret) return new Response(JSON.stringify({ error: 'Setup disabled' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })

  const supplied = req.headers.get('x-setup-secret') || ''
  if (supplied !== secret) return unauthorized()

  const res = NextResponse.json({ ok: true })
  res.cookies.set('setup_session', '1', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 })
  return res
}

export const POST = rateLimitMiddleware(handler)

