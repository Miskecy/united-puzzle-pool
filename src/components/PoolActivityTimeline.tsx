'use client'

import { useMemo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type BlockItem = {
	id: string
	puzzleAddress?: string | null
	bitcoinAddress?: string | null
	puzzleName?: string | null
	hexRangeStart: string
	hexRangeEnd: string
	hexRangeStartRaw?: string
	hexRangeEndRaw?: string
	createdAt?: string | null
	expiresAt?: string | null
	completedAt?: string | null
	creditsAwarded: number
}

export default function PoolActivityTimeline({
	active,
	validated,
	onHoverRange,
	animationsEnabled = true,
	moveAnimationEnabled = true,
	hoverAnimationEnabled = true,
	progressAnimationEnabled = true,
}: {
	active: BlockItem[]
	validated: BlockItem[]
	onHoverRange?: (startHex: string, endHex: string) => void
	animationsEnabled?: boolean
	moveAnimationEnabled?: boolean
	hoverAnimationEnabled?: boolean
	progressAnimationEnabled?: boolean
}) {
	const router = useRouter()
	const [nowTick, setNowTick] = useState<number>(() => Date.now())
	const containerRef = useRef<HTMLDivElement | null>(null)
	const rectsRef = useRef<Map<string, DOMRect>>(new Map())
	const prevStateRef = useRef<Map<string, 'active' | 'validated'>>(new Map())
	const [dataVersion, setDataVersion] = useState(0)
	const animateIdsRef = useRef<Set<string>>(new Set())
	const hoverIdsRef = useRef<Set<string>>(new Set())
	const prevActiveIdsRef = useRef<string[]>([])
	const animCountRef = useRef<number>(0)
	const [containerW, setContainerW] = useState<number>(0)
	const initialRenderRef = useRef<boolean>(true)

	const onAnimStart = () => {
		if (!(animationsEnabled && moveAnimationEnabled)) return
		animCountRef.current += 1
	}
	const onAnimEnd = () => {
		if (!(animationsEnabled && moveAnimationEnabled)) return
		animCountRef.current = Math.max(0, animCountRef.current - 1)
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

	useEffect(() => {
		const id = setInterval(() => setNowTick(Date.now()), 1000)
		return () => clearInterval(id)
	}, [])

	const activeItems = useMemo(() => (active ?? []).slice(0, 10), [active])
	const validatedItems = useMemo(() => (validated ?? []).slice(0, 10), [validated])
	useEffect(() => {
		const prevIds = prevActiveIdsRef.current
		const nowValidatedIds = validatedItems.map(b => b.id)
		const movedIds = new Set<string>(prevIds.filter(id => nowValidatedIds.includes(id)))
		animateIdsRef.current = movedIds
		prevActiveIdsRef.current = activeItems.map(b => b.id)
		setDataVersion(v => v + 1)
	}, [activeItems, validatedItems])

	useEffect(() => {
		prevActiveIdsRef.current = activeItems.map(b => b.id)
	}, [activeItems])

	type ItemWithState = BlockItem & { state: 'active' | 'validated' }
	const leftPositions: Map<string, number> = useMemo(() => {
		const w = Math.max(0, containerW)
		const center = w / 2
		const cardW = 180
		const gap = 16
		const m = new Map<string, number>()
		activeItems.forEach((a, idx) => {
			const left = center - gap - cardW - idx * (cardW + gap)
			m.set(a.id, left)
		})
		validatedItems.forEach((v, idx) => {
			const left = center + gap + idx * (cardW + gap)
			m.set(v.id, left)
		})
		return m
	}, [activeItems, validatedItems, containerW])

	function TimelineCard({ item, version, left }: { item: ItemWithState, version: number, left: number }) {
		const ref = useRef<HTMLDivElement | null>(null)
		const lastHoverFill = useRef<number>(0)
		const lastVersionRef = useRef<number>(-1)
		useLayoutEffect(() => {
			if (lastVersionRef.current === version) return
			lastVersionRef.current = version
			const el = ref.current
			if (!el) return
			const prev = rectsRef.current.get(item.id)
			const next = el.getBoundingClientRect()
			const prevState = prevStateRef.current.get(item.id)
			const shouldAnimate = (animationsEnabled && moveAnimationEnabled) && animateIdsRef.current.has(item.id) && !hoverIdsRef.current.has(item.id)
			if (prev && prevState && prevState !== item.state && shouldAnimate) {
				onAnimStart()
				setTimeout(onAnimEnd, 800)
			}
			rectsRef.current.set(item.id, next)
			prevStateRef.current.set(item.id, item.state)
		})
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
		const isHovered = hoverIdsRef.current.has(item.id)
		const addr = item.puzzleAddress || item.bitcoinAddress || 'Unknown address'
		const lenLabel = formatLenPrecise(binLength(item.hexRangeStart, item.hexRangeEnd))
		const cls = item.state === 'active' ? 'block3d block3d-active shrink-0' : 'block3d block3d-validated shrink-0'
		return (
			<div
				ref={ref}
				className={cls}
				style={{ position: 'absolute', top: 10, left, transition: (animationsEnabled ? 'left 800ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none') }}
				onMouseEnter={() => { hoverIdsRef.current.add(item.id); lastHoverFill.current = fillPct; onHoverRange?.(item.hexRangeStart, item.hexRangeEnd) }}
				onMouseLeave={() => { hoverIdsRef.current.delete(item.id); lastHoverFill.current = 0; onHoverRange?.('', '') }}
				onClick={() => router.push(`/block/${item.id}`)}
			>
				<div className="block3d-content" style={{ transition: (animationsEnabled && hoverAnimationEnabled) ? 'transform .2s ease, box-shadow .2s ease' : 'none', transform: (animationsEnabled && hoverAnimationEnabled) ? undefined : 'none' }}>
					{item.state === 'active' ? <div className="time-fill" style={{ height: `${isHovered ? lastHoverFill.current : fillPct}%`, transition: (animationsEnabled && progressAnimationEnabled) ? 'height .5s ease' : 'none' }} /> : null}
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
	}

	useEffect(() => {
		const el = containerRef.current
		const measure = () => setContainerW(el ? el.clientWidth : 0)
		measure()
		if (!el) return
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	useEffect(() => {
		initialRenderRef.current = false
	}, [])

	return (
		<div className="full-bleed relative" onMouseLeave={() => onHoverRange?.('', '')}>
			<div className="absolute left-1/2 top-0 bottom-0 border-l-2 border-dashed border-gray-300" />
			<div ref={containerRef} className="timeline-row">
				{activeItems.map((a) => (
					<TimelineCard key={a.id} item={{ ...a, state: 'active' }} version={dataVersion} left={leftPositions.get(a.id) ?? 0} />
				))}
				{validatedItems.map((v) => (
					<TimelineCard key={v.id} item={{ ...v, state: 'validated' }} version={dataVersion} left={leftPositions.get(v.id) ?? 0} />
				))}
			</div>

			<style jsx global>{`
        .full-bleed { width: 100vw; position: relative; left: 50%; transform: translateX(-50%); }
        .timeline-row { position: relative; height: 200px; overflow: hidden; }
        .block3d { position: absolute; isolation: isolate; width: 180px; height: 180px; cursor: pointer; will-change: left, transform; }
        .block3d-content { 
          position: relative; z-index: 1; will-change: transform;
          width: 100%; 
          height: 100%; 
          border-radius: 8px; 
          background: #ffffff;
          border: 1px solid #e5e7eb; 
          box-shadow: 0 2px 4px rgba(0,0,0,.08);
          transition: transform .2s ease, box-shadow .2s ease; 
        }
        .time-fill { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(245,158,11,.18); border-radius: 8px; pointer-events: none; transition: height .5s ease; }
        .block3d:before { 
          content: ''; 
          position: absolute; 
          top: -4px; 
          left: -4px; 
          width: 100%; 
          height: 100%; 
          background: #4b4b4b;
          border-radius: 8px; 
          z-index: 0;
        }
        .block3d-active:before { background: #f59e0b; }
        .block3d-validated:before { background: #059669; }
        .block3d-active .block3d-content { box-shadow: 0 2px 4px rgba(245,158,11,.18); }
        .block3d-validated .block3d-content { box-shadow: 0 2px 4px rgba(5,150,105,.18); }
        .block3d:hover .block3d-content { 
          transform: translate(2px, 2px); 
          box-shadow: 0 4px 8px rgba(0,0,0,.12); 
        }
        .block3d-active:hover .block3d-content { box-shadow: 0 6px 12px rgba(245,158,11,.28); }
        .block3d-validated:hover .block3d-content { box-shadow: 0 6px 12px rgba(5,150,105,.28); }

        .block3d-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .block3d-puzzle { font-size: 13px; color: #111827; font-weight: 700; }
        .block3d-title { 
          display: block; 
          font-size: 11px; 
          color: #6b7280; 
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; 
          font-weight: 500; 
        }
        .block3d-range { 
          font-size: 10px; 
          color: #4b5563; 
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; 
          line-height: 1.4;
        }
        .block3d-difficulty { font-size: 10px; color: #374151; font-weight: 500; }
        .block3d-meta { display: flex; align-items: center; justify-content: space-between; }
        .block3d-meta .time { 
          font-size: 11px; 
          color: #1f2937; 
          background: #f3f4f6; 
          padding: 2px 6px; 
          border-radius: 6px; 
        }
        .block3d-meta .credits { 
          font-size: 11px; 
          color: #059669; 
          background: #d1fae5; 
          padding: 2px 6px; 
          border-radius: 6px; 
          font-weight: 600; 
        }
      `}</style>
		</div>
	)
}
