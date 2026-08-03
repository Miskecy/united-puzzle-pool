import crypto from 'crypto'

function sign(token: string, secret: string): string {
	return crypto.createHmac('sha256', secret).update(token).digest('hex')
}

export function createSession(secret: string): string {
	const token = crypto.randomBytes(32).toString('hex')
	return `${token}.${sign(token, secret)}`
}

export function verifySession(cookieHeader: string | null, secret: string): boolean {
	if (!secret || !cookieHeader) return false
	const match = /(?:^|;\s*)setup_session=([^;]+)/.exec(cookieHeader)
	if (!match) return false
	const value = match[1]
	const dot = value.lastIndexOf('.')
	if (dot < 0) return false
	const token = value.slice(0, dot)
	const sig = value.slice(dot + 1)
	if (!token || !sig) return false
	try {
		const expected = sign(token, secret)
		if (expected.length !== sig.length) return false
		return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
	} catch {
		return false
	}
}
