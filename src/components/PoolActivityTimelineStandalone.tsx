'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type BlockItem = {
	id: string
	puzzleAddress?: string | null
	bitcoinAddress?: string | null
	puzzleName?: string | null
	hexRangeStart: string
	hexRangeEnd: string
	createdAt?: string | null
	completedAt?: string | null
	expiresAt?: string | null
	creditsAwarded: number
}

export default function PoolActivityTimelineStandalone({
	active,
	validated,
	animationsEnabled = true,
	cardWidth = 180,
	gap = 16,
	onHoverRange,
	isLoading,
}: {
	active: BlockItem[]
	validated: BlockItem[]
	animationsEnabled?: boolean
	cardWidth?: number
	gap?: number
	onHoverRange?: (startHex: string, endHex: string) => void
	isLoading?: boolean
}) {
	const router = useRouter()
	const [nowTick, setNowTick] = useState<number>(() => Date.now())
	const containerRef = useRef<HTMLDivElement | null>(null)
	const [containerW, setContainerW] = useState(0)

	useEffect(() => {
		const id = setInterval(() => setNowTick(Date.now()), 1000)
		return () => clearInterval(id)
	}, [])

	useEffect(() => {
		const el = containerRef.current
		const measure = () => setContainerW(el ? el.clientWidth : 0)
		measure()
		if (!el) return
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	const activeItems = useMemo(() => (active ?? []).slice(0, 10), [active])
	const validatedItems = useMemo(() => (validated ?? []).slice(0, 10), [validated])
	const loading = (typeof isLoading === 'boolean')
		? isLoading
		: ((activeItems.length === 0) && (validatedItems.length === 0))

	type ItemWithState = BlockItem & { state: 'active' | 'validated' }
	const unified: ItemWithState[] = useMemo(() => {
		const map = new Map<string, ItemWithState>()
		for (const a of activeItems) map.set(a.id, { ...a, state: 'active' })
		for (const v of validatedItems) map.set(v.id, { ...v, state: 'validated' })
		return Array.from(map.values())
	}, [activeItems, validatedItems])

	const positions: Map<string, number> = useMemo(() => {
		const w = Math.max(0, containerW)
		const center = w / 2
		const m = new Map<string, number>()
		let ai = 0
		let vi = 0
		for (const item of unified) {
			if (item.state === 'active') {
				const left = center - gap - cardWidth - ai * (cardWidth + gap)
				m.set(item.id, left)
				ai++
			} else {
				const left = center + gap + vi * (cardWidth + gap)
				m.set(item.id, left)
				vi++
			}
		}
		return m
	}, [unified, containerW, cardWidth, gap])

	// no max needed; each validated block's fill is relative to its own time limit (expiresAt - createdAt)

	const fmtAgo = (dateStr?: string | null) => {
		if (!dateStr) return '—'
		const t = new Date(dateStr).getTime()
		const s = Math.max(0, Math.floor((nowTick - t) / 1000))
		if (s < 60) return `${s}s ago`
		const m = Math.floor(s / 60)
		if (m < 60) return `${m}min ago`
		const h = Math.floor(m / 60)
		if (h < 24) return `${h}h ago`
		const d = Math.floor(h / 24)
		return `${d}d ago`
	}

	const parseHexBI = (hex: string) => BigInt(`0x${hex.replace(/^0x/, '')}`)
	const binLength = (startHex: string, endHex: string) => {
		const s = parseHexBI(startHex)
		const e = parseHexBI(endHex)
		return e >= s ? e - s : 0n
	}
	const formatLenPrecise = (lenBI: bigint) => {
		const len = Number(lenBI)
		if (!isFinite(len) || len <= 0) return ''
		const pow = `2^${Math.log2(len).toFixed(2)}`
		let unit = 'Keys'
		let num = len
		if (len >= 1e15) { unit = 'PKeys'; num = len / 1e15 }
		else if (len >= 1e12) { unit = 'TKeys'; num = len / 1e12 }
		else if (len >= 1e9) { unit = 'BKeys'; num = len / 1e9 }
		else if (len >= 1e6) { unit = 'MKeys'; num = len / 1e6 }
		else if (len >= 1e3) { unit = 'KKeys'; num = len / 1e3 }
		return `${pow} • ≈ ${num.toFixed(2)} ${unit}`
	}

	return (
		<div className="full-bleed relative h-64">
			{!loading && (
				<>
					<div className="absolute left-1/2 top-0 bottom-0 border-l-2 border-dashed border-gray-300" />
					<div className="side-legend side-legend-left">Active</div>
					<div className="side-legend side-legend-right">Validated</div>
				</>
			)}
			{loading && (
				<div className="loading-overlay">
					<div className="loading-box">
						<div className="spinner" />
						<span className="loading-text">Loading activity…</span>
					</div>
				</div>
			)}
			<div ref={containerRef} className="timeline-row top-8">
				{unified.map(item => {
					const left = positions.get(item.id) ?? 0
					const addr = item.puzzleAddress || item.bitcoinAddress || 'Unknown address'
					const lenLabel = formatLenPrecise(binLength(item.hexRangeStart, item.hexRangeEnd))
					const cls = item.state === 'active' ? 'block3d block3d-active' : 'block3d block3d-validated'
					const totalMs = (() => {
						const c = item.createdAt ? new Date(item.createdAt).getTime() : NaN
						const e = item.expiresAt ? new Date(item.expiresAt).getTime() : NaN
						if (!isFinite(c) || !isFinite(e) || e <= c) return 0
						return e - c
					})()
					const remainingMs = (() => {
						const e = item.expiresAt ? new Date(item.expiresAt).getTime() : NaN
						const now = nowTick
						if (!isFinite(e)) return 0
						return Math.max(0, e - now)
					})()
					const fillPct = item.state === 'active' && totalMs > 0 ? Math.max(0, Math.min(100, Math.round((1 - (remainingMs / totalMs)) * 100))) : 0
					const durFillPct = (() => {
						if (item.state !== 'validated') return 0
						const c = item.createdAt ? new Date(item.createdAt).getTime() : NaN
						const d = item.completedAt ? new Date(item.completedAt).getTime() : NaN
						const limitEnd = item.expiresAt
							? new Date(item.expiresAt).getTime()
							: (isFinite(c) ? c + 12 * 60 * 60 * 1000 : NaN)
						if (!isFinite(c) || !isFinite(d) || !isFinite(limitEnd)) return 0
						const totalLimit = limitEnd - c
						const remainingAtValidation = limitEnd - d
						const spent = totalLimit - remainingAtValidation
						if (totalLimit <= 0 || spent <= 0) return 0
						return Math.max(0, Math.min(100, Math.round((spent / totalLimit) * 100)))
					})()
					return (
						<div
							key={item.id}
							className={cls}
							style={{ position: 'absolute', top: 10, left, width: cardWidth, transition: animationsEnabled ? 'left 800ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none' }}
							onMouseEnter={() => onHoverRange?.(item.hexRangeStart, item.hexRangeEnd)}
							onMouseLeave={() => onHoverRange?.('', '')}
							onClick={() => router.push(`/block/${item.id}`)}
						>
							<div className="block3d-content">
								{item.state === 'active' ? <div className="time-fill" style={{ height: `${fillPct}%` }} /> : null}
								{item.state === 'validated' ? <div className="duration-fill" style={{ height: `${durFillPct}%` }} /> : null}
								<div className="block3d-body">
									<div className="block3d-puzzle">{item.puzzleName || 'Puzzle'}</div>
									<div className="block3d-title">{addr.slice(0, 8)}...{addr.slice(-8)}</div>
									<div className="block3d-range">{item.hexRangeStart.slice(0, 8)}...{item.hexRangeStart.slice(-4)} → {item.hexRangeEnd.slice(0, 8)}...{item.hexRangeEnd.slice(-4)}</div>
									<div className="block3d-difficulty">{lenLabel}</div>
									<div className="block3d-meta">
										<span className="time">{fmtAgo(item.state === 'active' ? item.createdAt : item.completedAt)}</span>
										<span className="credits">{item.state === 'active' ? '—' : Number(item.creditsAwarded ?? 0).toFixed(3)}</span>
									</div>
								</div>
							</div>
						</div>
					)
				})}
			</div>

			<style jsx global>{`
        .full-bleed { width: 100vw; position: relative; left: 50%; transform: translateX(-50%); }
        .timeline-row { position: relative; height: 200px; overflow: hidden; }
        .side-legend { position: absolute; top: 6px; font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 9999px; white-space: nowrap; }
        .side-legend-left { left: calc(50% - 8px); transform: translateX(-100%); color: #666666; }
        .side-legend-right { left: calc(50% + 8px); transform: translateX(0); color: #666666;  }
        .loading-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 50; background: linear-gradient(to bottom right, rgba(255,255,255,0.85), rgba(255,255,255,0.7)); backdrop-filter: blur(2px); }
        .loading-box { display: inline-flex; align-items: center; gap: 10px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 14px; box-shadow: 0 6px 18px rgba(59,130,246,0.12); }
        .spinner { width: 22px; height: 22px; border: 3px solid #bfdbfe; border-top-color: #3b82f6; border-right-color: #93c5fd; border-radius: 50%; animation: spin .9s linear infinite; }
        .loading-text { font-size: 13px; color: #1f2937; font-weight: 700; letter-spacing: .02em; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .block3d { isolation: isolate; height: 180px; cursor: pointer; will-change: left, transform; }
        .block3d-content { position: relative; z-index: 1; height: 100%; border-radius: 8px; background: #ffffff; border: 1px solid #e5e7eb; box-shadow: 0 2px 4px rgba(0,0,0,.08); transition: transform .2s ease, box-shadow .2s ease; }
        .duration-fill { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(156,163,175,.24); border-radius: 8px; pointer-events: none; transition: height .5s ease; }
        .time-fill { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(245,158,11,.18); border-radius: 8px; pointer-events: none; transition: height .5s ease; }
        .block3d:before { content: ''; position: absolute; top: -4px; left: -4px; width: 100%; height: 100%; background: #4b4b4b; border-radius: 8px; z-index: 0; }
        .block3d-active:before { background: #f59e0b; }
        .block3d-validated:before { background: #059669; }
        .block3d-active .block3d-content { box-shadow: 0 2px 4px rgba(245,158,11,.18); }
        .block3d-validated .block3d-content { box-shadow: 0 2px 4px rgba(5,150,105,.18); }
        .block3d:hover .block3d-content { transform: translate(2px, 2px); box-shadow: 0 4px 8px rgba(0,0,0,.12); }
        .block3d-active:hover .block3d-content { box-shadow: 0 6px 12px rgba(245,158,11,.28); }
        .block3d-validated:hover .block3d-content { box-shadow: 0 6px 12px rgba(5,150,105,.28); }
        .block3d-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .block3d-puzzle { font-size: 13px; color: #111827; font-weight: 700; }
        .block3d-title { display: block; font-size: 11px; color: #6b7280; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-weight: 500; }
        .block3d-range { font-size: 10px; color: #4b5563; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; line-height: 1.4; }
        .block3d-difficulty { font-size: 10px; color: #374151; font-weight: 500; }
        .block3d-meta { display: flex; align-items: center; justify-content: space-between; }
        .block3d-meta .time { font-size: 11px; color: #1f2937; background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
        .block3d-meta .credits { font-size: 11px; color: #059669; background: #d1fae5; padding: 2px 6px; border-radius: 6px; font-weight: 600; }
      `}</style>
		</div>
	)
}
