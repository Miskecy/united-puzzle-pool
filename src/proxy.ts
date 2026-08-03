import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Edge-compatible HMAC verification (Web Crypto, no Node.js crypto module needed)
async function verifySetupSession(req: NextRequest): Promise<boolean> {
	const secret = process.env.SETUP_SECRET
	if (!secret) return false
	const value = req.cookies.get('setup_session')?.value
	if (!value) return false
	const dot = value.lastIndexOf('.')
	if (dot < 0) return false
	const token = value.slice(0, dot)
	const sig = value.slice(dot + 1)
	if (!token || sig.length !== 64) return false
	try {
		const enc = new TextEncoder()
		const key = await crypto.subtle.importKey(
			'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
		)
		const pairs = sig.match(/.{2}/g)
		if (!pairs || pairs.length !== 32) return false
		const sigBytes = new Uint8Array(pairs.map(b => parseInt(b, 16)))
		return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(token))
	} catch {
		return false
	}
}

export async function proxy(req: NextRequest) {
	const { pathname } = req.nextUrl

	// Protect the setup config page — redirect to login
	if (pathname.startsWith('/setup/config')) {
		if (!await verifySetupSession(req)) {
			const url = req.nextUrl.clone()
			url.pathname = '/setup'
			return NextResponse.redirect(url)
		}
		return NextResponse.next()
	}

	// Protect all admin-only API routes — return JSON 401
	const isAdminApi =
		pathname.startsWith('/api/admin/') ||
		pathname === '/api/config' ||
		pathname.startsWith('/api/config/')

	if (isAdminApi) {
		if (!await verifySetupSession(req)) {
			return new NextResponse(
				JSON.stringify({ error: 'Unauthorized' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			)
		}
	}

	return NextResponse.next()
}

export const config = {
	matcher: [
		'/setup/config/:path*',
		'/api/admin/:path*',
		'/api/config',
		// Exclude /api/config/backup so Next.js never buffers its body through the
		// proxy layer (avoids the middlewareClientMaxBodySize cap for large DB restores).
		// Auth for that route is enforced directly in the route handler.
		'/api/config/((?!backup(?:/|$)).*)',
	],
}
