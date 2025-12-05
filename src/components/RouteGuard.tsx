"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
	children: React.ReactNode
	fallback?: React.ReactNode
	verifyUrl?: string
	redirectTo?: string
}

export default function RouteGuard({ children, fallback, verifyUrl = '/api/config', redirectTo = '/setup' }: Props) {
	const router = useRouter()
	const [allowed, setAllowed] = useState<boolean | null>(null)

	useEffect(() => {
		let cancelled = false
			; (async () => {
				try {
					const r = await fetch(verifyUrl, { method: 'GET' })
					if (r.ok) {
						if (!cancelled) setAllowed(true)
					} else {
						if (!cancelled) setAllowed(false)
						router.push(redirectTo)
					}
				} catch {
					if (!cancelled) setAllowed(false)
					router.push(redirectTo)
				}
			})()
		return () => { cancelled = true }
	}, [verifyUrl, redirectTo, router])

	if (allowed) return <>{children}</>
	return <>{fallback ?? <div className="loading-overlay">
		<div className="loading-box">
			<div className="spinner" />
			<span className="loading-text">Redirecting…</span>
		</div>
	</div>}</>
}

