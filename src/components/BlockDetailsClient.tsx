'use client'

import { Gauge, Hash, Clock, ArrowRight } from 'lucide-react'
import BlockLiveClient from '@/components/BlockLiveClient'
import CopyButton from '@/components/CopyButton'
import BackButton from '@/components/BackButton'
import { useTranslation } from '@/contexts/LanguageContext'

interface BlockData {
	id: string; bitcoinAddress: string; puzzleAddress?: string | null; tokenMasked: string
	status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | string
	hexRangeStart: string; hexRangeEnd: string; hexRangeStartRaw: string; hexRangeEndRaw: string
	assignedAt: string; completedAt?: string | null; expiresAt?: string | null
	durationSeconds: number | null; keysValidated: number; avgSpeedKeysPerSec: number | null
	creditsAwarded: number; checkworkAddresses: string[]; privateKeys: (string | undefined)[]
	addressMap: { privateKey?: string; address: string; isValid: boolean }[]
	matchedCount: number; missingAddresses: string[]
}

function timeAgoStr(dt?: string | null): string {
	if (!dt) return '—'
	const s = Math.max(0, Math.floor((Date.now() - new Date(dt).getTime()) / 1000))
	if (s < 60) return `${s}s ago`
	const m = Math.floor(s / 60); if (m < 60) return `${m}min ago`
	const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
	const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`
	const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`
	return `${Math.floor(mo / 12)}y ago`
}

function formatSpeed(n?: number | null): string {
	if (!n || !isFinite(n) || n <= 0) return '—'
	if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TKeys/s`
	if (n >= 1e9) return `${(n / 1e9).toFixed(2)} BKeys/s`
	if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MKeys/s`
	if (n >= 1e3) return `${(n / 1e3).toFixed(2)} KKeys/s`
	return `${n.toFixed(2)} Keys/s`
}

function mask(addr: string): string {
	const a = addr || ''
	if (!a) return '—'
	return `${a.slice(0, 6)}…${a.slice(Math.max(0, a.length - 6))}`
}

function formatDuration(seconds?: number | null): string {
	if (!seconds || seconds <= 0) return '—'
	let rem = seconds
	const d = Math.floor(rem / 86400); rem -= d * 86400
	const h = Math.floor(rem / 3600); rem -= h * 3600
	const m = Math.floor(rem / 60); rem -= m * 60
	const parts: string[] = []
	if (d) parts.push(`${d}d`)
	if (h) parts.push(`${h}h`)
	if (m) parts.push(`${m}m`)
	if (rem) parts.push(`${rem}s`)
	return parts.length ? parts.join(' ') : '0s'
}

function formatDifficultyPrecise(lenHexStart: string, lenHexEnd: string): string {
	try {
		const diff = BigInt(lenHexEnd) - BigInt(lenHexStart)
		if (diff <= 0n) return '2^0'
		const len = Number(diff)
		const pow = `2^${Math.log2(len).toFixed(2)}`
		let unit = 'Keys'; let num = len
		if (len >= 1e15) { unit = 'PKeys'; num = len / 1e15 }
		else if (len >= 1e12) { unit = 'TKeys'; num = len / 1e12 }
		else if (len >= 1e9) { unit = 'BKeys'; num = len / 1e9 }
		else if (len >= 1e6) { unit = 'MKeys'; num = len / 1e6 }
		else if (len >= 1e3) { unit = 'KKeys'; num = len / 1e3 }
		return `${pow} • ≈ ${num.toFixed(2)} ${unit}`
	} catch { return '2^0' }
}

export default function BlockDetailsClient({ id, ok, block, dataError }: {
	id: string
	ok: boolean
	block: BlockData | null
	dataError: { error?: string } | null
}) {
	const { t } = useTranslation()

	const StatusBadge = ({ block }: { block: BlockData }) => {
		if (block.completedAt)
			return <span className="volt-badge-success flex items-center gap-1"><Clock className="h-3 w-3" />{t('blockDetail.performance.completed')} {timeAgoStr(block.completedAt)}</span>
		if (block.status === 'EXPIRED')
			return <span className="volt-badge-danger flex items-center gap-1"><Clock className="h-3 w-3" />{t('blockDetail.performance.expired')} {timeAgoStr(block.expiresAt)}</span>
		return <span className="volt-badge-accent flex items-center gap-1"><Clock className="h-3 w-3" />{t('blockDetail.performance.active')}</span>
	}

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text">
			<div className="max-w-6xl mx-auto px-4 sm:px-7 py-10 space-y-6">

				<div className="flex items-center gap-3 pb-4" style={{ borderBottom: '1px solid #262624' }}>
					<BackButton />
					<h1 className="text-[24px] font-bold ml-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('blockDetail.title')}</h1>
				</div>

				{!ok && (
					<div className="volt-card p-5 flex items-center gap-3" style={{ border: '1px solid rgba(240,85,74,0.3)' }}>
						<span className="text-[13px]" style={{ color: '#f0554a' }}>{t('blockDetail.failedToLoad')} <span className="font-mono">{id}</span>. {dataError?.error || t('blockDetail.notExist')}</span>
					</div>
				)}

				{ok && block && (
					<div className="space-y-5">
						<div className="flex flex-wrap items-center gap-2">
							<span className="volt-badge-neutral flex items-center gap-1"><Hash className="h-3 w-3" />{t('blockDetail.block')} {block.id.substring(0, 8)}…</span>
							<StatusBadge block={block} />
							<span className="volt-badge-neutral flex items-center gap-1"><Gauge className="h-3 w-3" />{formatDifficultyPrecise(block.hexRangeStartRaw, block.hexRangeEndRaw)}</span>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
							<div className="volt-card md:col-span-2">
								<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
									<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('blockDetail.assignment.title')}</div>
									<div className="flex items-center gap-2">
										<Hash className="h-4 w-4" style={{ color: '#fc5c04' }} />
										<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('blockDetail.assignment.subtitle')}</span>
									</div>
									<p className="text-[12.5px] mt-1" style={{ color: '#5c5a55' }}>{t('blockDetail.assignment.description')}</p>
								</div>
								<div className="px-6 py-5 space-y-4">
									<div>
										<p className="text-[12px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#5c5a55' }}>{t('blockDetail.assignment.keyRange')}</p>
										<div className="flex items-center justify-between rounded-[10px] px-4 py-3 gap-3" style={{ background: '#191919', border: '1px solid #262624' }}>
											<code className="text-[12px] font-mono break-all flex-1" style={{ color: '#f4f3ee' }}>
												{block.hexRangeStart} <ArrowRight className="inline h-3 w-3 mx-1" style={{ color: '#5c5a55' }} /> {block.hexRangeEnd}
											</code>
											{!block.completedAt && (
												<CopyButton text={`${block.hexRangeStart}:${block.hexRangeEnd}`} className="volt-btn-ghost text-[11px] px-3 py-1.5">{t('blockDetail.assignment.copy')}</CopyButton>
											)}
										</div>
									</div>
									<div className="grid grid-cols-2 gap-4 text-[13px]">
										<div>
											<p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{t('blockDetail.assignment.assignedBy')}</p>
											<p className="font-mono" style={{ color: '#f4f3ee' }}>{mask(block.bitcoinAddress)}</p>
										</div>
										<div>
											<p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{t('blockDetail.assignment.tokenMask')}</p>
											<p className="font-mono" style={{ color: '#f4f3ee' }}>{block.tokenMasked}</p>
										</div>
										<div>
											<p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{t('blockDetail.assignment.assignedAt')}</p>
											<p style={{ color: '#9a9892' }}>{new Date(block.assignedAt).toLocaleString()}</p>
										</div>
										<div>
											<p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{t('blockDetail.assignment.duration')}</p>
											<p className="font-mono" style={{ color: '#9a9892' }}>{formatDuration(block.durationSeconds)}</p>
										</div>
									</div>
								</div>
							</div>

							<div className="volt-card">
								<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
									<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('blockDetail.performance.title')}</div>
									<div className="flex items-center gap-2">
										<Gauge className="h-4 w-4" style={{ color: '#fc5c04' }} />
										<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('blockDetail.performance.subtitle')}</span>
									</div>
								</div>
								<div className="px-6 py-5 space-y-3 text-[13px]">
									<div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid #262624' }}>
										<span style={{ color: '#9a9892' }}>{t('blockDetail.performance.avgSpeed')}</span>
										<span className="font-mono font-semibold" style={{ color: '#3ddc84' }}>{formatSpeed(block.avgSpeedKeysPerSec)}</span>
									</div>
									<div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid #262624' }}>
										<span style={{ color: '#9a9892' }}>{t('blockDetail.performance.keysValidated')}</span>
										<span className="font-mono" style={{ color: '#f4f3ee' }}>{block.keysValidated.toLocaleString()}</span>
									</div>
									<div className="flex justify-between items-center py-2">
										<span style={{ color: '#9a9892' }}>{t('blockDetail.performance.creditsAwarded')}</span>
										<span className="font-mono font-semibold" style={{ color: '#fc5c04' }}>{block.creditsAwarded}</span>
									</div>
								</div>
							</div>
						</div>

						<BlockLiveClient
							id={block.id}
							hexRangeStart={block.hexRangeStart}
							hexRangeEnd={block.hexRangeEnd}
							checkworkAddresses={block.checkworkAddresses}
							initialAddressMap={block.addressMap}
							completedAt={block.completedAt}
							puzzleAddress={block.puzzleAddress ?? undefined}
						/>
					</div>
				)}
			</div>
		</div>
	)
}
