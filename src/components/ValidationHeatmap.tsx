'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Hash, Expand, Gauge, CheckCircle2, Flame } from 'lucide-react'

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
}

const HEATMAP_COLORS = Array.from({ length: 50 }, (_, i) => {
	const t = i / 49
	const hue = Math.round(220 - 220 * t)
	const sat = Math.round(40 + 45 * t)
	const light = Math.round(88 - 43 * t)
	const alpha = 0.35 + 0.65 * t
	return `hsla(${hue}, ${sat}%, ${light}%, ${alpha.toFixed(2)})`
})

function parseHexBI(hex: string): bigint {
	const clean = hex.replace(/^0x/, '')
	return BigInt(`0x${clean}`)
}

function binLength(startHex: string, endHex: string): bigint {
	const s = parseHexBI(startHex)
	const e = parseHexBI(endHex)
	return e >= s ? e - s : 0n
}

function pow2Label(len: bigint): string {
	if (len <= 0n) return '0'
	const expCeil = len.toString(2).length
	return `2^${expCeil}`
}

function formatTrillionsNum(n: number): string {
	const t = n / 1_000_000_000_000
	if (t >= 100) return `${Math.round(t)}T`
	if (t >= 10) return `${t.toFixed(1)}T`
	return `${t.toFixed(2)}T`
}

function formatTrillionsBI(n: bigint): string {
	const T = 1_000_000_000_000n
	const tInt = n / T
	const rem = n % T
	const twoDec = (rem * 100n) / T
	const intStr = tInt.toString()
	const withCommas = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
	return `${withCommas}.${twoDec.toString().padStart(2, '0')}T`
}

function toBI(n: number): bigint {
	if (!Number.isFinite(n)) return 0n
	const safe = Math.max(0, Math.floor(n))
	return BigInt(safe)
}

function formatPercentPrecise(completed: number, lenBI: bigint): string {
	try {
		const len = lenBI
		if (len <= 0n) return '0.00000%'
		const cBI = toBI(completed)
		const scale = 100000n
		const scaled = (cBI * 100n * scale) / len
		const intPart = scaled / scale
		const frac = scaled % scale
		return `${intPart.toString()}.${frac.toString().padStart(5, '0')}%`
	} catch {
		return '0.00000%'
	}
}

function formatCompactHexRange(hex: string): string {
	const s = hex.startsWith('0x') ? hex.slice(2) : hex
	if (s.length <= 24) return `0x${s}`
	const head = s.slice(0, 10)
	const tail = s.slice(-8)
	return `0x${head}…${tail}`
}

function heatColor(percent: number, completed?: number, mode: 'percent' | 'absolute' = 'percent', absMax?: number): string {
	const colors = HEATMAP_COLORS
	if (mode === 'absolute') {
		const max = absMax && isFinite(absMax) && absMax > 0 ? absMax : 1
		const c = completed && isFinite(completed) ? Math.max(0, completed) : 0
		const ratio = Math.max(0, Math.min(1, c / max))
		const idx = Math.round(ratio * (colors.length - 1))
		return colors[idx]
	} else {
		const p = isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0
		const idx = Math.round((p / 100) * (colors.length - 1))
		return colors[idx]
	}
}

export default function ValidationHeatmap({ bins, binCount, hoveredBlockCells = [], highlightBinIndex = null, focusCellIndex = null, onClearFocus, onNavigateBin }: Props) {
	const router = useRouter()
	const [colorMode, setColorMode] = useState<'percent' | 'absolute'>('percent')
	const [hoveredCell, setHoveredCell] = useState<number | null>(null)

	const activeCells = binCount ?? bins.length
	const totalCells = 256
	const offset = Math.max(0, totalCells - activeCells)
	const maxAbsCompleted = useMemo(() => Math.max(0, ...bins.map(b => Math.max(0, b.completed || 0))), [bins])

	const highlightedCells: number[] = useMemo(() => {
		return highlightBinIndex !== null && highlightBinIndex >= 0 ? [offset + highlightBinIndex] : []
	}, [highlightBinIndex, offset])

	return (
		<Card className="shadow-md border-gray-200 mb-8">
			<CardHeader className="border-b pb-4">
				<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
					<Flame className="h-5 w-5 text-orange-600" /> Validation Heatmap
				</CardTitle>
				<CardDescription className="text-gray-600">Visual intensity of validated key space across the puzzle.</CardDescription>
			</CardHeader>
			<CardContent className="pt-6">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2 text-sm text-gray-700">
						<Gauge className="h-4 w-4 text-orange-600" />
						<span className="font-semibold">Color Scale Mode</span>
					</div>
					<div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
						<button type="button" onClick={() => setColorMode('percent')} className={`px-3 py-1 text-xs font-medium ${colorMode === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>Percent</button>
						<button type="button" onClick={() => setColorMode('absolute')} className={`px-3 py-1 text-xs font-medium border-l border-gray-300 ${colorMode === 'absolute' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>Absolute (T-keys)</button>
					</div>
				</div>

				<p className="text-xs text-gray-600 mb-4">Darker colors indicate higher validation either by <span className="font-semibold">percent</span> or <span className="font-semibold">absolute</span> mode. Cells outside the configured puzzle range appear transparent with a dashed border.</p>

				<TooltipProvider delayDuration={0}>
					<div className="heatmap-container bg-purple-100/10 border border-gray-100  rounded-lg p-3 sm:p-4">
						<div className="inline-grid heatmap-grid">
							{Array.from({ length: totalCells }, (_, i) => {
								const cell = i >= offset ? (bins[i - offset] ?? null) : null
								const lenBI = cell ? binLength(cell.startHex, cell.endHex) : 0n
								const lenPow = cell ? pow2Label(lenBI) : ''
								const completedT = cell ? formatTrillionsNum(cell.completed) : ''
								const totalT = cell ? formatTrillionsBI(lenBI) : ''
								const bg = cell ? ((cell.completed ?? 0) > 0 ? heatColor(cell.percent, cell.completed, colorMode, maxAbsCompleted) : 'transparent') : 'transparent'
								const isFocused = focusCellIndex !== null && focusCellIndex === i
								const isHovered = (hoveredCell === i) || hoveredBlockCells.includes(i) || highlightedCells.includes(i) || isFocused

								const colorsLen = HEATMAP_COLORS.length
								let colorIdx = 0
								if (cell && (cell.completed ?? 0) > 0) {
									if (colorMode === 'absolute') {
										const max = maxAbsCompleted && isFinite(maxAbsCompleted) && maxAbsCompleted > 0 ? maxAbsCompleted : 1
										const c = cell.completed && isFinite(cell.completed) ? Math.max(0, cell.completed) : 0
										const ratio = Math.max(0, Math.min(1, c / max))
										colorIdx = Math.round(ratio * (colorsLen - 1))
									} else {
										const p = isFinite(cell.percent) ? Math.max(0, Math.min(100, cell.percent)) : 0
										colorIdx = Math.round((p / 100) * (colorsLen - 1))
									}
								}
								const textClass = colorIdx >= 35 ? 'text-white' : 'text-gray-700'

								const style = cell
									? {
										backgroundColor: bg,
										border: isHovered ? '2px solid #3b82f6' : '1px solid rgba(0,0,0,0.1)',
										transform: isHovered ? 'scale(1.05)' : 'scale(1)',
										zIndex: isHovered ? 10 : 1,
									}
									: {
										backgroundColor: bg,
										border: '1px dashed #d1d5db',
										opacity: 0.5,
									}

								return (
									<Tooltip key={i} open={(hoveredCell === i) || isFocused}>
										<TooltipTrigger asChild>
											<div
												style={style}
												className="w-full rounded-md relative overflow-hidden cursor-pointer heatmap-cell transition-all duration-200"
												onMouseEnter={() => setHoveredCell(i)}
												onMouseLeave={() => setHoveredCell(null)}
												onClick={() => {
													if (onClearFocus) onClearFocus()
													setHoveredCell(null)
													if (!cell) return
													if (onNavigateBin) onNavigateBin(cell.index)
													else router.push(`/overview/bin/${cell.index}`)
												}}
											>
												{cell && (
													<span className={`absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] ${textClass} font-semibold pointer-events-none`}>
														{lenPow}
													</span>
												)}
											</div>
										</TooltipTrigger>
										{cell && (
											<TooltipContent side="top" align="center" sideOffset={8} className="bg-gray-900 border-gray-800 text-white max-w-xs">
												<div className="space-y-3 p-2">
													<div className="flex items-center gap-2 font-semibold text-sm border-b border-gray-700 pb-2">
														<Hash className="h-4 w-4 text-blue-400" />
														<span className="font-mono text-blue-400">Bin {cell.index + 1} / {activeCells}</span>
													</div>
													<div className="flex items-start gap-2 text-xs">
														<Expand className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
														<div className="font-mono text-gray-300 overflow-hidden">
															<div className="font-medium text-white mb-1">Range</div>
															<div className="text-[10px] break-all">{formatCompactHexRange(cell.startHex)}</div>
															<div className="text-[10px] break-all opacity-80">{formatCompactHexRange(cell.endHex)}</div>
														</div>
													</div>
													<div className="flex items-center gap-2 text-xs text-gray-300">
														<Gauge className="h-3 w-3 text-purple-400" />
														<span className="font-mono"><span className="font-medium text-white">Length:</span> {lenPow}</span>
													</div>
													<div className="flex items-center gap-2 text-xs text-gray-300">
														<CheckCircle2 className="h-3 w-3 text-green-400" />
														<span className="font-mono"><span className="font-medium text-white">Validated:</span> {formatPercentPrecise(cell.completed, lenBI)}</span>
													</div>
													<div className="text-xs font-mono text-gray-300">
														<span className="font-medium text-white">Progress:</span> {completedT} / {totalT}
													</div>
												</div>
												<TooltipPrimitive.Arrow className="fill-gray-900" width={10} height={6} />
											</TooltipContent>
										)}
									</Tooltip>
								)
							})}
						</div>
					</div>
				</TooltipProvider>

				<div className="mt-4 text-sm text-gray-600 flex flex-col sm:flex-row sm:items-center gap-4">
					<div className="flex items-center gap-2 scale-container">
						<span className="font-semibold">Scale: 0%</span>
						{HEATMAP_COLORS.map((c, i) => (
							<span key={i} className="inline-block rounded-sm scale-swatch h-3 w-3" style={{ backgroundColor: c }}></span>
						))}
						<span className="font-semibold">100%</span>
					</div>
				</div>

				<style jsx>{`
          .heatmap-grid { display: grid; grid-template-columns: repeat(16, minmax(0, 1fr)); gap: 3px; }
          @media (max-width: 640px) { .heatmap-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; } }
          @media (min-width: 641px) and (max-width: 1024px) { .heatmap-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 3px; } }
          .heatmap-cell { width: 100%; aspect-ratio: 3 / 1; min-height: 18px; }
          @media (max-width: 640px) { .heatmap-cell { aspect-ratio: 3 / 1; min-height: 16px; } }
          @media (min-width: 641px) and (max-width: 1024px) { .heatmap-cell { aspect-ratio: 3 / 1; min-height: 17px; } }
          .scale-container { display: flex; flex-wrap: wrap; gap: 6px; }
          .scale-swatch { display: inline-block; width: 12px; height: 12px; border: 1px solid rgba(0,0,0,0.08); transition: transform .15s ease, box-shadow .15s ease; cursor: pointer; }
          .scale-swatch:hover { transform: translateY(-1px) scale(1.7); box-shadow: 0 0 0 2px rgba(59,130,246,.25); z-index: 5; }
        `}</style>
			</CardContent>
		</Card>
	)
}
