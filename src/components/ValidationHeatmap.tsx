'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Flame, PackageSearch, ChevronDown } from 'lucide-react'
import { useTranslation } from '@/contexts/LanguageContext'

type BinStat = {
	index: number
	startHex: string
	endHex: string
	total: number
	completed: number
	percent: number
}

type Props = {
	bins: BinStat[]
	binCount?: number
	hoveredBlockCells?: number[]
	highlightBinIndex?: number | null
	focusCellIndex?: number | null
	onClearFocus?: () => void
	onNavigateBin?: (index: number) => void
	activeRanges?: { startHex: string; endHex: string }[]
	completedRanges?: { startHex: string; endHex: string }[]
}

const HEATMAP_COLORS = Array.from({ length: 50 }, (_, i) => {
	const t = i / 49
	const hue = Math.round(220 - 220 * t)
	const sat = Math.round(40 + 45 * t)
	const light = Math.round(88 - 43 * t)
	const alpha = 0.35 + 0.65 * t
	return `hsla(${hue}, ${sat}%, ${light}%, ${alpha.toFixed(2)})`
})

const GRADIENT = `linear-gradient(to right, ${HEATMAP_COLORS[0]}, ${HEATMAP_COLORS[12]}, ${HEATMAP_COLORS[25]}, ${HEATMAP_COLORS[37]}, ${HEATMAP_COLORS[49]})`

function parseHexBI(hex: string): bigint {
	return BigInt(`0x${hex.replace(/^0x/, '')}`)
}
function binLength(startHex: string, endHex: string): bigint {
	const s = parseHexBI(startHex), e = parseHexBI(endHex)
	return e >= s ? e - s : 0n
}
function pow2Label(len: bigint): string {
	if (len <= 0n) return '0'
	return `2^${len.toString(2).length}`
}
function formatTrillionsNum(n: number): string {
	const t = n / 1_000_000_000_000
	if (t >= 100) return `${Math.round(t)}T`
	if (t >= 10) return `${t.toFixed(1)}T`
	return `${t.toFixed(2)}T`
}
function formatTrillionsBI(n: bigint): string {
	const T = 1_000_000_000_000n
	const tInt = n / T, rem = n % T
	const twoDec = (rem * 100n) / T
	return `${tInt.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${twoDec.toString().padStart(2, '0')}T`
}
function toBI(n: number): bigint {
	if (!Number.isFinite(n)) return 0n
	return BigInt(Math.max(0, Math.floor(n)))
}
function formatPercentPrecise(completed: number, lenBI: bigint): string {
	try {
		if (lenBI <= 0n) return '0.00000%'
		const cBI = toBI(completed)
		const scale = 100000n
		const scaled = (cBI * 100n * scale) / lenBI
		const intPart = scaled / scale, frac = scaled % scale
		return `${intPart}.${frac.toString().padStart(5, '0')}%`
	} catch { return '0.00000%' }
}
function formatCompactHexRange(hex: string): string {
	const s = hex.startsWith('0x') ? hex.slice(2) : hex
	if (s.length <= 24) return `0x${s}`
	return `0x${s.slice(0, 10)}…${s.slice(-8)}`
}
function heatColor(percent: number, completed: number | undefined, mode: 'percent' | 'absolute', absMax?: number): string {
	const colors = HEATMAP_COLORS
	if (mode === 'absolute') {
		const max = absMax && isFinite(absMax) && absMax > 0 ? absMax : 1
		const c = completed && isFinite(completed) ? Math.max(0, completed) : 0
		const idx = Math.round(Math.max(0, Math.min(1, c / max)) * (colors.length - 1))
		return colors[idx]
	}
	const p = isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0
	return colors[Math.round((p / 100) * (colors.length - 1))]
}

const RANGE_STATUS_CLASS: Record<string, string> = {
	VALIDATED: 'volt-badge-success',
	ACTIVE: 'volt-badge-accent',
	PARTIAL: 'volt-badge-neutral',
	OUT_OF_RANGE: 'volt-badge-neutral',
	NOT_FOUND: 'volt-badge-danger',
}

export default function ValidationHeatmap({
	bins, binCount, hoveredBlockCells = [], highlightBinIndex = null,
	focusCellIndex = null, onClearFocus, onNavigateBin,
	activeRanges = [], completedRanges = [],
}: Props) {
	const router = useRouter()
	const { t } = useTranslation()
	const [colorMode, setColorMode] = useState<'percent' | 'absolute'>('percent')
	const [hoveredCell, setHoveredCell] = useState<number | null>(null)
	const [localFocusCell, setLocalFocusCell] = useState<number | null>(null)
	const [rangeInput, setRangeInput] = useState('')
	const [rangeStatus, setRangeStatus] = useState<'VALIDATED' | 'ACTIVE' | 'PARTIAL' | 'NOT_FOUND' | 'OUT_OF_RANGE' | null>(null)
	const [rangeMsg, setRangeMsg] = useState('')
	const [coveredCells, setCoveredCells] = useState<number[]>([])
	const [rangeDetail, setRangeDetail] = useState('')
	const [suppressTooltip, setSuppressTooltip] = useState(false)
	const [rangeCheckOpen, setRangeCheckOpen] = useState(false)

	const activeCells = binCount ?? bins.length
	const totalCells = 256
	const offset = Math.max(0, totalCells - activeCells)
	const maxAbsCompleted = useMemo(() => Math.max(0, ...bins.map(b => Math.max(0, b.completed || 0))), [bins])

	const highlightedCells = useMemo(() =>
		highlightBinIndex !== null && highlightBinIndex >= 0 ? [offset + highlightBinIndex] : [],
		[highlightBinIndex, offset],
	)

	useEffect(() => {
		if (focusCellIndex !== null) {
			setCoveredCells([]); setRangeStatus(null); setRangeMsg(''); setRangeDetail(''); setSuppressTooltip(false)
		}
	}, [focusCellIndex])

	async function checkRangeAndFocus() {
		try {
			setSuppressTooltip(true)
			const parts = rangeInput.trim().split(':')
			if (parts.length !== 2) { setRangeStatus(null); setRangeMsg(t('heatmap.rangeLookup.typeAsStartEnd')); return }
			const normHex = (h: string) => {
				let v = h.trim().replace(/^0x/, '').toLowerCase()
				if (!/^[0-9a-f]+$/.test(v) || v.length === 0 || v.length > 64) return null
				if (v.length < 64) v = v.padStart(64, '0')
				return '0x' + v
			}
			const sHex = normHex(parts[0]), eHex = normHex(parts[1])
			if (!sHex || !eHex) { setRangeStatus(null); setRangeMsg(t('heatmap.rangeLookup.invalidHex')); return }
			const sBI = parseHexBI(sHex), eBI = parseHexBI(eHex)
			if (eBI < sBI) { setRangeStatus(null); setRangeMsg(t('heatmap.rangeLookup.endBeforeStart')); return }

			const puzzleStart = bins.length > 0 ? parseHexBI(bins[0].startHex) : 0n
			const puzzleEnd = bins.length > 0 ? parseHexBI(bins[bins.length - 1].endHex) : 0n
			let status: typeof rangeStatus = 'NOT_FOUND'

			if (eBI < puzzleStart || sBI > puzzleEnd) {
				status = 'OUT_OF_RANGE'
			} else {
				const exactCompleted = completedRanges.find(cr => parseHexBI(cr.startHex) === sBI && parseHexBI(cr.endHex) === eBI)
				const exactActive = activeRanges.find(ar => parseHexBI(ar.startHex) === sBI && parseHexBI(ar.endHex) === eBI)
				const cellsInRange: number[] = []
				for (let i = 0; i < totalCells; i++) {
					const cell = i >= offset ? (bins[i - offset] ?? null) : null
					if (!cell) continue
					if (sBI <= parseHexBI(cell.endHex) && eBI >= parseHexBI(cell.startHex)) cellsInRange.push(i)
				}
				setCoveredCells(cellsInRange)
				if (exactCompleted) status = 'VALIDATED'
				else if (exactActive) status = 'ACTIVE'
				else if (cellsInRange.length > 0) {
					const anyProgress = cellsInRange.some(i => {
						const cell = bins[i - offset]; return !!(cell && ((cell.completed ?? 0) > 0 || (cell.percent ?? 0) > 0))
					})
					status = anyProgress ? 'PARTIAL' : 'NOT_FOUND'
				}
			}

			setRangeStatus(status)
			if (status === 'OUT_OF_RANGE') {
				setRangeMsg(t('heatmap.status.outsidePuzzle'))
				const ps = bins[0]?.startHex ? formatCompactHexRange(bins[0].startHex) : '—'
				const pe = bins[bins.length - 1]?.endHex ? formatCompactHexRange(bins[bins.length - 1].endHex) : '—'
				setRangeDetail(`${t('heatmap.status.outsidePuzzleDesc')} ${ps} → ${pe}.`)
			} else if (status === 'VALIDATED') {
				setRangeMsg(t('heatmap.status.validated'))
				setRangeDetail(t('heatmap.status.validatedDesc'))
			} else if (status === 'ACTIVE') {
				setRangeMsg(t('heatmap.status.active'))
				setRangeDetail(t('heatmap.status.activeDesc'))
			} else if (status === 'PARTIAL') {
				setRangeMsg(t('heatmap.status.partial'))
				setRangeDetail(t('heatmap.status.partialDesc'))
			} else {
				setRangeMsg(t('heatmap.status.notValidated'))
				setRangeDetail(t('heatmap.status.notValidatedDesc'))
			}
		} catch {
			setRangeStatus(null); setRangeMsg(t('heatmap.rangeLookup.failed'))
		}
	}

	return (
		<div className="volt-card mb-8">
			{/* Header */}
			<div
				className="px-6 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center gap-4"
				style={{ borderBottom: '1px solid #262624' }}
			>
				<div className="flex items-center gap-3 flex-1 min-w-0">
					<div
						className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
						style={{ background: 'rgba(252,92,4,0.1)', border: '1px solid rgba(252,92,4,0.15)' }}
					>
						<Flame className="h-4 w-4" style={{ color: '#fc5c04' }} />
					</div>
					<div className="min-w-0">
						<div className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>
							{t('heatmap.title')}
						</div>
						<p className="text-[12px] mt-0.5" style={{ color: '#5c5a55' }}>
							{t('heatmap.description')}
						</p>
					</div>
				</div>

				{/* Color mode toggle */}
				<div
					className="flex items-center gap-1 p-1 rounded-lg shrink-0"
					style={{ background: '#0f0f0f', border: '1px solid #1e1e1c' }}
				>
					{(['percent', 'absolute'] as const).map(mode => (
						<button
							key={mode}
							onClick={() => setColorMode(mode)}
							className="px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all duration-150"
							style={colorMode === mode
								? { background: '#fc5c04', color: '#0a0a0a' }
								: { color: '#5c5a55' }
							}
						>
							{mode === 'percent' ? t('heatmap.percent') : t('heatmap.absolute')}
						</button>
					))}
				</div>
			</div>

			<div className="px-6 py-5 space-y-5">
				{/* Range lookup accordion */}
				<div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e1e1c' }}>
					<button
						onClick={() => setRangeCheckOpen(v => !v)}
						className="w-full flex items-center justify-between px-4 py-3 text-left"
						style={{ background: '#111110' }}
					>
						<span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: '#f4f3ee' }}>
							<PackageSearch className="w-4 h-4" style={{ color: '#fc5c04' }} />
							{t('heatmap.rangeLookup.title')}
						</span>
						<ChevronDown
							className="h-4 w-4 shrink-0 transition-transform duration-200"
							style={{ color: '#5c5a55', transform: rangeCheckOpen ? 'rotate(180deg)' : 'none' }}
						/>
					</button>
					{rangeCheckOpen && (
						<div className="px-4 pb-4 pt-3 space-y-3" style={{ background: '#0d0d0c', borderTop: '1px solid #1e1e1c' }}>
							<p className="text-[11.5px]" style={{ color: '#5c5a55' }}>
								{t('heatmap.rangeLookup.description')} <span className="font-mono" style={{ color: '#9a9892' }}>{t('heatmap.rangeLookup.startEnd')}</span> {t('heatmap.rangeLookup.toCheck')}
							</p>
							<div className="flex gap-2">
								<div className="volt-input-wrap flex-1 min-w-0">
									<input
										className="w-full bg-transparent text-[12px] font-mono outline-none"
										style={{ color: '#f4f3ee' }}
										placeholder={t('heatmap.rangeLookup.placeholder')}
										value={rangeInput}
										onChange={e => setRangeInput(e.target.value)}
										onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); checkRangeAndFocus() } }}
									/>
								</div>
								<button
									onClick={checkRangeAndFocus}
									className="volt-btn-primary text-[12px] flex items-center gap-1.5 px-3 shrink-0"
								>
									<PackageSearch className="w-3.5 h-3.5" /> {t('heatmap.rangeLookup.check')}
								</button>
							</div>
							{(rangeMsg || rangeDetail) && (
								<div className="space-y-2 pt-1">
									{rangeMsg && rangeStatus && (
										<span className={RANGE_STATUS_CLASS[rangeStatus] ?? 'volt-badge-neutral'}>{rangeMsg}</span>
									)}
									{rangeDetail && (
										<p className="text-[11.5px] leading-relaxed" style={{ color: '#9a9892' }}>{rangeDetail}</p>
									)}
								</div>
							)}
						</div>
					)}
				</div>

				{/* Heatmap grid */}
				<TooltipProvider delayDuration={0}>
					<div className="rounded-xl p-3 sm:p-4" style={{ background: '#0f0f0f', border: '1px solid #1e1e1c' }}>
						<div className="hm-grid">
							{Array.from({ length: totalCells }, (_, i) => {
								const cell = i >= offset ? (bins[i - offset] ?? null) : null
								const lenBI = cell ? binLength(cell.startHex, cell.endHex) : 0n
								const lenPow = cell ? pow2Label(lenBI) : ''
								const completedT = cell ? formatTrillionsNum(cell.completed) : ''
								const totalT = cell ? formatTrillionsBI(lenBI) : ''
								const bg = cell && (cell.completed ?? 0) > 0
									? heatColor(cell.percent, cell.completed, colorMode, maxAbsCompleted)
									: 'transparent'
								const isFocused = (focusCellIndex !== null && focusCellIndex === i) || (localFocusCell !== null && localFocusCell === i)
								const isBlockHovered = hoveredBlockCells.includes(i)
								const isHighlighted = highlightedCells.includes(i) || coveredCells.includes(i)
								const isMouseHover = hoveredCell === i
								const isAnyActive = isMouseHover || isBlockHovered || isHighlighted || isFocused

								const cellStyle = cell
									? {
										backgroundColor: bg,
										border: isAnyActive ? 'none' : '1px solid rgba(255,255,255,0.05)',
										boxShadow: isAnyActive
											? isBlockHovered
												? '0 0 0 2px #3ddc84, 0 0 10px rgba(61,220,132,0.2)'
												: '0 0 0 2px #fc5c04, 0 0 10px rgba(252,92,4,0.2)'
											: undefined,
										zIndex: isAnyActive ? 10 : 1,
										cursor: 'pointer',
									}
									: {
										backgroundColor: 'transparent',
										border: '1px dashed rgba(255,255,255,0.18)',
										cursor: 'default',
									}

								return (
									<Tooltip key={i} open={(isMouseHover) || (!suppressTooltip && isFocused)}>
										<TooltipTrigger asChild>
											<div
												style={cellStyle}
												className="hm-cell rounded-md relative overflow-hidden transition-all duration-150"
												onMouseEnter={() => { setSuppressTooltip(false); setHoveredCell(i) }}
												onMouseLeave={() => setHoveredCell(null)}
												onClick={() => {
													if (!cell) return
													if (onClearFocus) onClearFocus()
													setCoveredCells([]); setRangeStatus(null); setRangeMsg(''); setRangeDetail('')
													setSuppressTooltip(false); setLocalFocusCell(null); setHoveredCell(null)
													if (onNavigateBin) onNavigateBin(cell.index)
													else router.push(`/overview/bin/${cell.index}`)
												}}
											>
												{cell && (
													<span
														className="hm-label absolute inset-0 flex items-center justify-center font-bold pointer-events-none select-none"
														style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
													>
														{lenPow}
													</span>
												)}
											</div>
										</TooltipTrigger>
										{cell && (
											<TooltipContent
												side="top"
												align="center"
												sideOffset={6}
												className="p-0"
												style={{
													background: '#141412',
													border: '1px solid #262624',
													boxShadow: '0 12px 40px rgba(0,0,0,0.75)',
													borderRadius: 12,
													minWidth: 220,
												}}
											>
												<div className="p-3.5 space-y-3">
													{/* Title */}
													<div className="flex items-center justify-between">
														<span className="text-[13px] font-bold font-mono" style={{ color: '#fc5c04' }}>
															{t('heatmap.tooltip.bin')} {cell.index + 1}
														</span>
														<span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#1e1e1c', color: '#5c5a55' }}>
															{t('heatmap.tooltip.of')} {activeCells}
														</span>
													</div>

													{/* Range */}
													<div className="rounded-lg p-2.5 space-y-1" style={{ background: '#0f0f0e', border: '1px solid #1e1e1c' }}>
														<div className="flex items-center gap-2 text-[10.5px] font-mono">
															<span className="shrink-0" style={{ color: '#5c5a55' }}>{t('heatmap.tooltip.from')}</span>
															<span className="truncate" style={{ color: '#9a9892' }}>{formatCompactHexRange(cell.startHex)}</span>
														</div>
														<div className="flex items-center gap-2 text-[10.5px] font-mono">
															<span className="shrink-0" style={{ color: '#5c5a55' }}>{t('heatmap.tooltip.to')}&nbsp;&nbsp;&nbsp;</span>
															<span className="truncate" style={{ color: '#9a9892' }}>{formatCompactHexRange(cell.endHex)}</span>
														</div>
													</div>

													{/* Stats */}
													<div className="space-y-1.5">
														<div className="flex items-center justify-between text-[12px]">
															<span style={{ color: '#5c5a55' }}>{t('heatmap.tooltip.length')}</span>
															<span className="font-mono font-semibold" style={{ color: '#f4f3ee' }}>{lenPow}</span>
														</div>
														<div className="flex items-center justify-between text-[12px]">
															<span style={{ color: '#5c5a55' }}>{t('heatmap.tooltip.validated')}</span>
															<span className="font-mono font-bold" style={{ color: '#3ddc84' }}>{formatPercentPrecise(cell.completed, lenBI)}</span>
														</div>
														<div className="flex items-center justify-between text-[12px]">
															<span style={{ color: '#5c5a55' }}>{t('heatmap.tooltip.keys')}</span>
															<span className="font-mono" style={{ color: '#9a9892' }}>{completedT} / {totalT}</span>
														</div>
													</div>

													{/* Progress bar */}
													<div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: '#1e1e1c' }}>
														<div style={{
															width: `${Math.min(100, cell.percent)}%`,
															height: 4,
															background: 'linear-gradient(to right, #fc5c04, #ff9c04)',
															borderRadius: 9999,
															transition: 'width 300ms ease',
														}} />
													</div>
												</div>
												<TooltipPrimitive.Arrow style={{ fill: '#141412' }} width={10} height={6} />
											</TooltipContent>
										)}
									</Tooltip>
								)
							})}
						</div>
					</div>
				</TooltipProvider>

				{/* Legend */}
				<div className="flex items-center gap-3">
					<span className="text-[11px] shrink-0 font-mono" style={{ color: '#5c5a55' }}>{t('heatmap.legend.min')}</span>
					<div
						className="flex-1 rounded-full"
						style={{ height: 8, background: GRADIENT, border: '1px solid rgba(255,255,255,0.06)' }}
					/>
					<span className="text-[11px] shrink-0 font-mono" style={{ color: '#5c5a55' }}>{t('heatmap.legend.max')}</span>
					<span
						className="text-[11px] shrink-0 px-2 py-0.5 rounded-full ml-1"
						style={{ background: '#111110', border: '1px solid #1e1e1c', color: '#5c5a55' }}
					>
						{colorMode === 'percent' ? t('heatmap.tooltip.coverage') : t('heatmap.tooltip.keysValidated')}
					</span>
				</div>
			</div>

			<style jsx>{`
				.hm-grid {
					display: grid;
					grid-template-columns: repeat(16, minmax(0, 1fr));
					gap: 3px;
				}
				@media (max-width: 640px) {
					.hm-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; }
				}
				@media (min-width: 641px) and (max-width: 1023px) {
					.hm-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 2px; }
				}
				.hm-cell {
					aspect-ratio: 2 / 1;
					min-height: 16px;
					cursor: pointer;
				}
				.hm-label { font-size: 0; }
				@media (min-width: 641px) { .hm-label { font-size: 8px; } }
				@media (min-width: 1024px) { .hm-label { font-size: 9px; } }
			`}</style>
		</div>
	)
}
