import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/setup/config')) {
    const setup = req.cookies.get('setup_session')?.value
    if (setup !== '1') {
      const url = req.nextUrl.clone()
      url.pathname = '/setup'
      return NextResponse.redirect(url)
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/setup/config/:path*'],
}

