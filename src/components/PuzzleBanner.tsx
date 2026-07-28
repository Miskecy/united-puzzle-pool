'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/contexts/LanguageContext'

type Info = { puzzleDetected?: boolean }

export default function PuzzleBanner() {
	const { t } = useTranslation()
	const [detected, setDetected] = useState(false)

	useEffect(() => {
		let mounted = true
		const check = async () => {
			try {
				const r = await fetch('/api/puzzle/info', { cache: 'no-store' })
				if (!r.ok) return
				const j: Info = await r.json()
				if (mounted) setDetected(!!j.puzzleDetected)
			} catch { }
		}
		check()
		const id = setInterval(check, 60000)
		return () => { mounted = false; clearInterval(id) }
	}, [])

	if (!detected) return null

	return (
		<div className="w-full" style={{ background: '#123420', borderBottom: '1px solid #3ddc84' }}>
			<div className="max-w-7xl mx-auto px-4 sm:px-7 py-2 flex items-center justify-end">
				<Link
					href="/overview"
					className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11.5px] font-semibold transition-colors duration-150"
					style={{ background: 'rgba(61,220,132,0.12)', color: '#3ddc84', border: '1px solid rgba(61,220,132,0.3)' }}
				>
					<span className="relative flex h-2 w-2">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#3ddc84' }} />
						<span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#3ddc84' }} />
					</span>
					{t('puzzleBanner.message')}
				</Link>
			</div>
		</div>
	)
}
