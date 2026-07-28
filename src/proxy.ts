import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function hasSetupSession(req: NextRequest): boolean {
	return req.cookies.get('setup_session')?.value === '1'
}

export function proxy(req: NextRequest) {
	const { pathname } = req.nextUrl

	// Protect the setup config page — redirect to login
	if (pathname.startsWith('/setup/config')) {
		if (!hasSetupSession(req)) {
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
		if (!hasSetupSession(req)) {
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
