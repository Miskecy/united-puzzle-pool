'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { formatScaledKeys } from '@/lib/utils'
import { useTranslation } from '@/contexts/LanguageContext'
import {
	ArrowLeft, ArrowRight, CheckCircle2, XCircle, Clock,
	Gauge, LocateFixed, Hash, Blocks, Activity, Bitcoin,
} from 'lucide-react'
import ValidationHeatmap from '@/components/ValidationHeatmap'

type BlockItem = {
	id: string
	status: string
	bitcoinAddress: string
	hexRangeStart: string
	hexRangeEnd: string
	createdAt?: string
	expiresAt?: string | null
	completedAt?: string | null
	creditsAwarded: number
}

function parseHexBI(hex: string): bigint {
	return BigInt(`0x${hex.replace(/^0x/, '')}`)
}

function pow2LenLabel(startHex: string, endHex: string): string {
	try {
		const s = parseHexBI(startHex), e = parseHexBI(endHex)
		const len = e >= s ? e - s : 0n
		if (len <= 0n) return '2^0.00'
		const bin = len.toString(2), bitlen = bin.length
		const K = Math.max(0, Math.min(24, bitlen - 1))
		let frac = 0
		if (K > 0) {
			const val = parseInt(bin.slice(0, K + 1), 2) / Math.pow(2, K)
			frac = Math.log2(val)
		}
		return `2^${((bitlen - 1) + frac).toFixed(2)}`
	} catch { return '2^0.00' }
}

function lengthLabel(startHex: string, endHex: string): string {
	try {
		const s = parseHexBI(startHex), e = parseHexBI(endHex)
		const len = e >= s ? e - s : 0n
		return `${pow2LenLabel(startHex, endHex)} · ${formatScaledKeys(len)}`
	} catch { return '—' }
}

function formatDelta(delta: bigint): string {
	if (delta === 0n) return '±0'
	const sign = delta < 0n ? '-' : '+'
	const abs = delta < 0n ? -delta : delta
	const digits = abs.toString()
	const exp = Math.max(0, digits.length - 1)
	const mantissa = digits.length >= 2 ? `${digits[0]}.${digits.slice(1, 3)}` : digits[0]
	return `${sign}${mantissa}×10^${exp}`
}

function fmtDate(s?: string | null): string {
	if (!s) return '—'
	const d = new Date(s)
	return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function toHex(big: bigint): string { return `0x${big.toString(16)}` }
function intersectLen(aS: bigint, aE: bigint, bS: bigint, bE: bigint): bigint {
	const s = aS > bS ? aS : bS, e = aE < bE ? aE : bE
	return e > s ? e - s : 0n
}

export default function BinDetailPage() {
	const { t } = useTranslation()
	const params = useParams()
	const router = useRouter()
	const sp = useSearchParams()
	const index = String(params?.index || '0')

	const [items, setItems] = useState<BlockItem[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [total, setTotal] = useState(0)
	const [meta, setMeta] = useState<{ index: number; startHex: string; endHex: string } | null>(null)
	const [subBins, setSubBins] = useState<Array<{ index: number; startHex: string; endHex: string; total: number; completed: number; percent: number }>>([])
	const [focusedCell, setFocusedCell] = useState<number | null>(null)

	const take = 50
	const pageParam = Number(sp.get('page') || 1)
	const page = isFinite(pageParam) && pageParam > 0 ? pageParam : 1
	const skip = (page - 1) * take

	useEffect(() => {
		const load = async () => {
			try {
				setLoading(true); setError(null)
				const r = await fetch(`/api/pool/bin?index=${index}&take=${take}&skip=${skip}`, { cache: 'no-store' })
				if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(String(j.error || 'Failed to load bin')) }
				const j = await r.json()
				setItems(Array.isArray(j.items) ? j.items : [])
				setTotal(Number(j.meta?.totalItems || 0))
				setMeta(j.meta ? { index: Number(j.meta.index), startHex: String(j.meta.startHex), endHex: String(j.meta.endHex) } : null)
			} catch (e) { setError(e instanceof Error ? e.message : 'Failed to load bin') }
			finally { setLoading(false) }
		}
		load()
	}, [index, skip])

	useEffect(() => {
		if (!meta) { setSubBins([]); return }
		try {
			const binStart = parseHexBI(meta.startHex), binEnd = parseHexBI(meta.endHex)
			if (binEnd <= binStart) { setSubBins([]); return }
			const COUNT = 256, totalLen = binEnd - binStart
			const baseChunk = totalLen / BigInt(COUNT), remainder = totalLen % BigInt(COUNT)
			let cursor = binStart
			const slices: Array<{ start: bigint; end: bigint }> = []
			for (let i = 0; i < COUNT; i++) {
				const extra = i < Number(remainder) ? 1n : 0n
				const size = baseChunk + extra
				slices.push({ start: cursor, end: cursor + size })
				cursor += size
			}
			const completed = items.filter(it => it.status === 'COMPLETED')
			setSubBins(slices.map((sl, idx) => {
				const lenBI = sl.end > sl.start ? sl.end - sl.start : 0n
				let compBI = 0n
				for (const it of completed) compBI += intersectLen(parseHexBI(it.hexRangeStart), parseHexBI(it.hexRangeEnd), sl.start, sl.end)
				const pct = lenBI > 0n ? Math.max(0, Math.min(100, Number((compBI * 100n) / lenBI))) : 0
				return { index: idx, startHex: toHex(sl.start), endHex: toHex(sl.end), total: Number(lenBI), completed: Number(compBI), percent: pct }
			}))
			setFocusedCell(null)
		} catch { setSubBins([]) }
	}, [meta, items])

	function findSubCell(startHex: string, endHex: string): number {
		if (!meta) return -1
		try {
			const binStart = parseHexBI(meta.startHex), binEnd = parseHexBI(meta.endHex)
			const blockStart = parseHexBI(startHex), blockEnd = parseHexBI(endHex)
			if (binEnd <= binStart || blockEnd <= blockStart) return -1
			const COUNT = 256, totalLen = binEnd - binStart
			const baseChunk = totalLen / BigInt(COUNT), remainder = totalLen % BigInt(COUNT)
			let cursor = binStart, best = -1; let bestOverlap = 0n
			for (let i = 0; i < COUNT; i++) {
				const extra = i < Number(remainder) ? 1n : 0n
				const size = baseChunk + extra
				const end = cursor + size
				const overlap = intersectLen(blockStart, blockEnd, cursor, end)
				if (overlap > bestOverlap) { bestOverlap = overlap; best = i }
				cursor = end
			}
			return best
		} catch { return -1 }
	}

	const totalPages = useMemo(() => take > 0 ? Math.max(1, Math.ceil(total / take)) : 1, [total])

	function getPageNums(current: number, total: number): (number | '…')[] {
		if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
		const pages: (number | '…')[] = [1]
		if (current > 3) pages.push('…')
		for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
		if (current < total - 2) pages.push('…')
		pages.push(total)
		return pages
	}

	const completedCount = items.filter(b => b.status === 'COMPLETED').length
	const activeCount = items.filter(b => b.status === 'ACTIVE').length

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
			<div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

				{/* ── Back + header ── */}
				<div className="mb-8">
					<button
						onClick={() => router.push('/overview')}
						className="volt-btn-ghost inline-flex items-center gap-2 text-[13px] mb-5"
					>
						<ArrowLeft className="w-4 h-4" /> {t('bin.backToOverview')}
					</button>

					<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
						<div className="flex items-center gap-4">
							<div
								className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
								style={{ background: 'rgba(252,92,4,0.1)', border: '1px solid rgba(252,92,4,0.2)' }}
							>
								<Hash className="h-6 w-6" style={{ color: '#fc5c04' }} />
							</div>
							<div>
								<div className="text-[11px] font-bold uppercase tracking-widest mb-0.5" style={{ color: '#fc5c04' }}>{t('bin.puzzleBin')}</div>
								<h1 className="text-[28px] font-bold leading-none" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee', letterSpacing: '-0.02em' }}>
									{t('bin.bin')} {meta ? meta.index + 1 : index}
								</h1>
							</div>
						</div>

						{meta && (
							<span className="volt-badge-accent text-[11px] self-start sm:self-center">
								{lengthLabel(meta.startHex, meta.endHex)}
							</span>
						)}
					</div>

					{/* Range */}
					{meta && (
						<div className="mt-4 rounded-xl p-3 sm:p-4" style={{ background: '#0f0f0e', border: '1px solid #1e1e1c' }}>
							<div className="text-[10.5px] font-bold uppercase tracking-wider mb-2" style={{ color: '#5c5a55' }}>{t('bin.hexRange')}</div>
							<div className="flex flex-col gap-1.5 font-mono text-[11.5px]" style={{ color: '#9a9892' }}>
								<div className="flex items-center gap-2 flex-wrap">
									<span style={{ color: '#5c5a55' }}>{t('bin.from')}</span>
									<span className="break-all" style={{ color: '#f4f3ee' }}>{meta.startHex}</span>
								</div>
								<div className="flex items-center gap-2 flex-wrap">
									<span style={{ color: '#5c5a55' }}>{t('bin.to')}</span>
									<span className="break-all" style={{ color: '#f4f3ee' }}>{meta.endHex}</span>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* ── Summary stats ── */}
				{!loading && !error && (
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
						{[
							{ icon: Blocks, label: t('bin.stats.totalBlocks'), value: String(total), color: '#f4f3ee', bg: 'rgba(255,255,255,0.04)', border: '#1e1e1c' },
							{ icon: CheckCircle2, label: t('bin.stats.completed'), value: String(completedCount), color: '#3ddc84', bg: 'rgba(61,220,132,0.06)', border: 'rgba(61,220,132,0.15)' },
							{ icon: Activity, label: t('bin.stats.active'), value: String(activeCount), color: '#fc5c04', bg: 'rgba(252,92,4,0.06)', border: 'rgba(252,92,4,0.15)' },
							{ icon: Gauge, label: t('bin.stats.thisPage'), value: `${items.length} / ${take}`, color: '#9a9892', bg: 'rgba(255,255,255,0.04)', border: '#1e1e1c' },
						].map(({ icon: Icon, label, value, color, bg, border }) => (
							<div key={label} className="rounded-xl p-4" style={{ background: bg, border: `1px solid ${border}` }}>
								<div className="flex items-center gap-1.5 mb-2">
									<Icon className="h-3.5 w-3.5" style={{ color }} />
									<span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{label}</span>
								</div>
								<div className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color, letterSpacing: '-0.02em' }}>{value}</div>
							</div>
						))}
					</div>
				)}

				{/* ── Heatmap ── */}
				{subBins.length > 0 && (
					<ValidationHeatmap
						bins={subBins}
						binCount={256}
						focusCellIndex={focusedCell}
						onClearFocus={() => setFocusedCell(null)}
						onNavigateBin={() => { }}
						activeRanges={items.filter(it => it.status === 'ACTIVE').map(it => ({ startHex: it.hexRangeStart, endHex: it.hexRangeEnd }))}
						completedRanges={items.filter(it => it.status === 'COMPLETED').map(it => ({ startHex: it.hexRangeStart, endHex: it.hexRangeEnd }))}
					/>
				)}

				{/* ── Blocks list ── */}
				<div className="volt-card">
					<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
						<div>
							<div className="text-[11px] font-bold uppercase tracking-widest mb-0.5" style={{ color: '#fc5c04' }}>{t('bin.records')}</div>
							<div className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('bin.blocks')}</div>
						</div>
						<span className="text-[12px]" style={{ color: '#5c5a55' }}>
							{t('bin.page')} {page} {t('bin.of')} {totalPages}
						</span>
					</div>

					<div className="px-6 py-5">
						{loading ? (
							<div className="space-y-3">
								{Array.from({ length: 4 }, (_, i) => (
									<div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: '#111110', border: '1px solid #1e1e1c' }}>
										<div className="h-4 w-48 rounded mb-3" style={{ background: '#1e1e1c' }} />
										<div className="h-3 w-72 rounded" style={{ background: '#1a1a18' }} />
									</div>
								))}
							</div>
						) : error ? (
							<div className="rounded-xl p-4 flex items-center gap-3" style={{ background: '#1e0a09', border: '1px solid rgba(240,85,74,0.2)' }}>
								<XCircle className="w-5 h-5 shrink-0" style={{ color: '#f0554a' }} />
								<span className="text-[13px]" style={{ color: '#f0554a' }}>{error}</span>
							</div>
						) : items.length === 0 ? (
							<div className="text-center py-10">
								<Blocks className="h-8 w-8 mx-auto mb-3" style={{ color: '#2a2926' }} />
								<p className="text-[13px]" style={{ color: '#5c5a55' }}>{t('bin.noBlocksYet')}</p>
							</div>
						) : (
							<div className="space-y-3">
								{items.map((b, listIdx) => {
									const prev = listIdx > 0 ? items[listIdx - 1] : null
									const delta = prev ? formatDelta(parseHexBI(b.hexRangeEnd) - parseHexBI(prev.hexRangeEnd)) : null
									const isCompleted = b.status === 'COMPLETED'
									const isActive = b.status === 'ACTIVE'

									return (
										<div
											key={b.id}
											className="rounded-xl overflow-hidden"
											style={{ background: '#111110', border: '1px solid #1e1e1c' }}
										>
											{/* Card header */}
											<div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid #1a1a18' }}>
												<div className="flex items-center gap-2 min-w-0">
													{isCompleted ? (
														<span className="volt-badge-success flex items-center gap-1 shrink-0">
															<CheckCircle2 className="w-3 h-3" /> {t('bin.block.completed')}
														</span>
													) : isActive ? (
														<span className="volt-badge-accent flex items-center gap-1 shrink-0">
															<Activity className="w-3 h-3" /> {t('bin.block.active')}
														</span>
													) : (
														<span className="volt-badge-neutral shrink-0">{b.status}</span>
													)}
													<span className="font-mono text-[11.5px] truncate" style={{ color: '#9a9892' }}>{b.id}</span>
												</div>
												<div className="flex items-center gap-2 shrink-0">
													{delta && (
														<span className="font-mono text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(252,92,4,0.08)', color: '#fc5c04', border: '1px solid rgba(252,92,4,0.15)' }}>
															{delta}
														</span>
													)}
													<button
														className="volt-btn-ghost text-[12px] px-2.5 py-1.5 inline-flex items-center gap-1.5"
														title="View on heatmap"
														onClick={() => {
															const idx = findSubCell(b.hexRangeStart, b.hexRangeEnd)
															if (idx >= 0) { setFocusedCell(idx); window.scrollTo({ top: 0, behavior: 'smooth' }) }
														}}
													>
														<LocateFixed className="w-3.5 h-3.5" />
														<span className="hidden sm:inline">Locate</span>
													</button>
												</div>
											</div>

											{/* Card body */}
											<div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
												{/* Range */}
												<div className="rounded-lg p-3" style={{ background: '#0d0d0c', border: '1px solid #1e1e1c' }}>
													<div className="flex items-center justify-between mb-2">
														<span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('bin.block.range')}</span>
														<span className="text-[10.5px] font-mono" style={{ color: '#fc5c04' }}>{lengthLabel(b.hexRangeStart, b.hexRangeEnd)}</span>
													</div>
													<div className="space-y-1.5 font-mono text-[11px]">
														<div className="flex gap-2">
															<span className="shrink-0 text-[10px] font-semibold uppercase" style={{ color: '#5c5a55', lineHeight: '18px' }}>{t('bin.from')}</span>
															<span className="break-all" style={{ color: '#c8c5be' }}>{b.hexRangeStart}</span>
														</div>
														<div className="flex gap-2">
															<span className="shrink-0 text-[10px] font-semibold uppercase" style={{ color: '#5c5a55', lineHeight: '18px' }}>{t('bin.to')}</span>
															<span className="break-all" style={{ color: '#c8c5be' }}>{b.hexRangeEnd}</span>
														</div>
													</div>
												</div>

												{/* Address + timestamps */}
												<div className="space-y-2">
													<div className="rounded-lg p-3" style={{ background: '#0d0d0c', border: '1px solid #1e1e1c' }}>
														<div className="flex items-center gap-1.5 mb-1.5">
															<Bitcoin className="w-3 h-3" style={{ color: '#fc5c04' }} />
															<span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('bin.block.miner')}</span>
														</div>
														<div className="font-mono text-[11.5px] break-all" style={{ color: '#d4d1cb' }}>{b.bitcoinAddress}</div>
													</div>

													<div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px]">
														{b.createdAt && (
															<div className="flex items-center gap-1.5">
																<Clock className="w-3 h-3 shrink-0" style={{ color: '#5c5a55' }} />
																<span style={{ color: '#5c5a55' }}>{t('bin.block.created')}</span>
																<span style={{ color: '#c8c5be' }}>{fmtDate(b.createdAt)}</span>
															</div>
														)}
														{b.completedAt && (
															<div className="flex items-center gap-1.5">
																<CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: '#3ddc84' }} />
																<span style={{ color: '#5c5a55' }}>{t('bin.block.done')}</span>
																<span style={{ color: '#c8c5be' }}>{fmtDate(b.completedAt)}</span>
															</div>
														)}
														{b.creditsAwarded > 0 && (
															<span className="px-2 py-0.5 rounded font-semibold text-[11px]" style={{ background: 'rgba(252,92,4,0.12)', color: '#fc5c04', border: '1px solid rgba(252,92,4,0.2)' }}>
																{b.creditsAwarded.toFixed(3)} cr
															</span>
														)}
													</div>
												</div>
											</div>
										</div>
									)
								})}
							</div>
						)}

						{/* Pagination */}
						{totalPages > 1 && (
							<div className="mt-6 flex items-center justify-between gap-2">
								<button
									className="volt-btn-ghost inline-flex items-center gap-2 text-[13px] shrink-0"
									disabled={page <= 1}
									onClick={() => router.push(`/overview/bin/${index}?page=${page - 1}`)}
									style={page <= 1 ? { opacity: 0.35, pointerEvents: 'none' } : {}}
								>
									<ArrowLeft className="w-4 h-4" /> {t('common.prev')}
								</button>

								<div className="flex items-center gap-1">
									{getPageNums(page, totalPages).map((p, i) =>
										p === '…' ? (
											<span key={`ellipsis-${i}`} className="w-8 text-center text-[12px]" style={{ color: '#5c5a55' }}>…</span>
										) : (
											<button
												key={p}
												onClick={() => router.push(`/overview/bin/${index}?page=${p}`)}
												className="w-8 h-8 rounded-lg text-[12px] font-semibold transition-all duration-100"
												style={p === page
													? { background: '#fc5c04', color: '#0a0a0a' }
													: { color: '#5c5a55' }
												}
											>
												{p}
											</button>
										)
									)}
								</div>

								<button
									className="volt-btn-ghost inline-flex items-center gap-2 text-[13px] shrink-0"
									disabled={page >= totalPages}
									onClick={() => router.push(`/overview/bin/${index}?page=${page + 1}`)}
									style={page >= totalPages ? { opacity: 0.35, pointerEvents: 'none' } : {}}
								>
									{t('common.next')} <ArrowRight className="w-4 h-4" />
								</button>
							</div>
						)}
					</div>
				</div>

			</div>
		</div>
	)
}
