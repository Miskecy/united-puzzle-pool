'use client'

import { useEffect, useState } from 'react'
import { Bitcoin, Copy, CheckCircle2, Wallet, Coins } from 'lucide-react'
import { useTranslation } from '@/contexts/LanguageContext'

type Variant = 'home' | 'dashboard' | 'overview'

type Info = {
	address: string
	txCount: number
	balanceBtc: number
	balanceUsd: number
	puzzleDetected?: boolean
}

export default function PuzzleInfoCard({ variant = 'dashboard' }: { variant?: Variant }) {
	const { t } = useTranslation()
	const [info, setInfo] = useState<Info | null>(null)
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			try {
				const r = await fetch('/api/puzzle/info', { cache: 'no-store' })
				if (!r.ok) { if (mounted) setInfo(null); return }
				const j = await r.json()
				if (mounted) setInfo(j)
			} catch { }
		}
		load()
		const id = setInterval(load, 300000)
		return () => { mounted = false; clearInterval(id) }
	}, [])

	const fmtUsd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
	const fmtBtc = (n: number) => `${n.toFixed(8)} BTC`

	const header =
		variant === 'home' ? t('puzzleInfo.currentPuzzle') :
		variant === 'overview' ? t('puzzleInfo.puzzleStatus') :
		t('puzzleInfo.puzzleInformation')
	const desc =
		variant === 'home' ? t('puzzleInfo.liveAddress') :
		variant === 'overview' ? t('puzzleInfo.addressBalance') :
		t('puzzleInfo.puzzleAddress')

	return (
		<div className="volt-card">
			{/* Header */}
			<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
				<div className="flex items-center justify-between">
					<div>
						<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>
							{t('puzzleInfo.bitcoinPuzzle')}
						</div>
						<div className="text-[19px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>
							{header}
						</div>
					</div>
					{info?.puzzleDetected && (
						<span
							className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11.5px] font-semibold"
							style={{ background: '#123420', color: '#3ddc84', border: '1px solid rgba(61,220,132,0.3)' }}
						>
							<span className="relative flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#3ddc84' }} />
								<span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#3ddc84' }} />
							</span>
							{t('puzzleInfo.keyFound')}
						</span>
					)}
				</div>
				<p className="text-[13px] mt-1" style={{ color: '#5c5a55' }}>{desc}</p>
			</div>

			{/* Body */}
			<div className="px-6 py-5">
				{info ? (
					<div className="space-y-4">
						{/* Address */}
						<div>
							<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>
								{t('puzzleInfo.targetAddress')}
							</label>
							<div
								className="flex items-center justify-between rounded-[10px] p-3 gap-2"
								style={{ background: '#191919', border: '1px solid #262624' }}
							>
								<code className="text-[13px] font-mono break-all select-all flex-1 pr-2" style={{ color: '#f4f3ee' }}>
									{info.address}
								</code>
								<button
									type="button"
									className="volt-btn-ghost shrink-0 px-3 py-2"
									onClick={async () => {
										try {
											await navigator.clipboard.writeText(info.address)
											setCopied(true)
											setTimeout(() => setCopied(false), 1500)
										} catch { }
									}}
								>
									{copied
										? <CheckCircle2 className="h-4 w-4" style={{ color: '#3ddc84' }} />
										: <Copy className="h-4 w-4" style={{ color: '#9a9892' }} />
									}
								</button>
							</div>
						</div>

						{/* Metrics */}
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
							<div className="volt-card p-4 flex flex-col justify-between" style={{ minHeight: 90 }}>
								<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('puzzleInfo.transactions')}</span>
								<div>
									<div className="flex items-center gap-2 mt-2">
										<Wallet className="h-4 w-4" style={{ color: '#fc5c04' }} />
										<span className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee', letterSpacing: '-0.02em' }}>
											{info.txCount}
										</span>
									</div>
									<div className="text-[11.5px] mt-0.5" style={{ color: '#5c5a55' }}>{t('puzzleInfo.onChainTotal')}</div>
								</div>
							</div>

							<div className="volt-card p-4 flex flex-col justify-between" style={{ minHeight: 90 }}>
								<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('puzzleInfo.balance')}</span>
								<div>
									<div className="text-[22px] font-bold mt-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#fc5c04', letterSpacing: '-0.02em' }}>
										{fmtBtc(info.balanceBtc)}
									</div>
									<div className="text-[11.5px] mt-0.5" style={{ color: '#5c5a55' }}>{t('puzzleInfo.confirmedBalance')}</div>
								</div>
							</div>

							<div className="volt-card p-4 flex flex-col justify-between" style={{ minHeight: 90 }}>
								<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('puzzleInfo.usdValue')}</span>
								<div>
									<div className="flex items-center gap-2 mt-2">
										<Coins className="h-4 w-4" style={{ color: '#3ddc84' }} />
										<span className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#3ddc84', letterSpacing: '-0.02em' }}>
											{fmtUsd(info.balanceUsd)}
										</span>
									</div>
									<div className="text-[11.5px] mt-0.5" style={{ color: '#5c5a55' }}>{t('puzzleInfo.atCurrentPrice')}</div>
								</div>
							</div>
						</div>
					</div>
				) : (
					<div className="animate-pulse space-y-4">
						<div className="h-4 rounded" style={{ background: '#191919', width: '40%' }} />
						<div className="h-11 rounded-[10px]" style={{ background: '#191919' }} />
						<div className="grid grid-cols-3 gap-3">
							<div className="h-20 rounded-2xl" style={{ background: '#191919' }} />
							<div className="h-20 rounded-2xl" style={{ background: '#191919' }} />
							<div className="h-20 rounded-2xl" style={{ background: '#191919' }} />
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
