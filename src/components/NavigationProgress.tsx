'use client'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'

function ProgressBar() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const [width, setWidth] = useState(0)
	const [visible, setVisible] = useState(false)

	useEffect(() => {
		const timers: ReturnType<typeof setTimeout>[] = []
		setVisible(true)
		setWidth(0)
		timers.push(setTimeout(() => setWidth(35), 20))
		timers.push(setTimeout(() => setWidth(65), 180))
		timers.push(setTimeout(() => setWidth(85), 400))
		timers.push(setTimeout(() => setWidth(100), 650))
		timers.push(setTimeout(() => setVisible(false), 900))
		return () => timers.forEach(clearTimeout)
	}, [pathname, searchParams])

	if (!visible) return null
	return (
		<div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, height: 2 }}>
			<div style={{
				height: '100%',
				width: `${width}%`,
				background: '#fc5c04',
				boxShadow: '0 0 8px rgba(252,92,4,0.5)',
				transition: width === 0 ? 'none' : 'width 280ms ease-out',
			}} />
		</div>
	)
}

export function NavigationProgress() {
	return (
		<Suspense fallback={null}>
			<ProgressBar />
		</Suspense>
	)
}
