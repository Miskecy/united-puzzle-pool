'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
	createdAt?: string
	completedAt: string
	creditsAwarded: number
}

export default function BlocksTimeline({
	items,
	pollUrl,
	pollIntervalMs = 30000,
	onHoverRange,
	direction = 'forward',
	speedMs = 60000,
	gapPx = 16,
}: {
	items: BlockItem[]
	pollUrl?: string
	pollIntervalMs?: number
	onHoverRange?: (startHex: string, endHex: string) => void
	direction?: 'forward' | 'reverse'
	speedMs?: number
	gapPx?: number
}) {
	const [blocks, setBlocks] = useState<BlockItem[]>(items ?? [])
	const router = useRouter()
	const trackRef = useRef<HTMLDivElement | null>(null)
	const [nowMs, setNowMs] = useState<number>(() => Date.now())



	useEffect(() => {
		if (!pollUrl) return
		let mounted = true
		const fetchBlocks = async () => {
			try {
				const r = await fetch(pollUrl, { cache: 'no-store' })
				if (!r.ok) return
				const j = await r.json()
				const list: BlockItem[] = (j?.recentBlocks ?? j ?? []).slice(0, 10)
				if (mounted) setBlocks(list)
			} catch { }
		}
		fetchBlocks()
		const id = setInterval(fetchBlocks, pollIntervalMs)
		return () => { mounted = false; clearInterval(id) }
	}, [pollUrl, pollIntervalMs])

	useEffect(() => {
		setBlocks(items ?? [])
	}, [items])

	useEffect(() => {
		const id = setInterval(() => setNowMs(Date.now()), 30000)
		return () => clearInterval(id)
	}, [])

	const loopBlocks = useMemo(() => {
		const base = (blocks ?? []).slice(0, 10)
		if (base.length === 0) return []
		return [...base, ...base]
	}, [blocks])

	const fmtAgo = (dateStr?: string) => {
		if (!dateStr) return '—'
		const t = new Date(dateStr).getTime()
		const s = Math.max(0, Math.floor((nowMs - t) / 1000))
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
		<div className="full-bleed overflow-hidden">

			<div className="relative timeline-container">
				<div
					ref={trackRef}
					className={`timeline-track ${direction === 'reverse' ? 'reverse' : 'forward'}`}
					style={{ animationDuration: `${Math.max(1000, speedMs)}ms`, animationPlayState: (loopBlocks.length > 0 ? 'running' : 'paused'), gap: `${Math.max(0, gapPx)}px` }}
				>
					{loopBlocks.map((b, i) => {
						const addr = b.puzzleAddress || b.bitcoinAddress || 'Unknown address'
						const lenLabel = formatLenPrecise(binLength(b.hexRangeStart, b.hexRangeEnd))
						return (
							<div
								key={`${b.id}-${i}`}
								className="block3d"
								onMouseEnter={() => onHoverRange?.(b.hexRangeStart, b.hexRangeEnd)}
								onMouseLeave={() => onHoverRange?.('', '')}
								onClick={() => router.push(`/block/${b.id}`)}
							>
								<div className="block3d-content">
									<div className="block3d-body">
										<div className="block3d-puzzle">{b.puzzleName || 'Puzzle'}</div>
										<div className="block3d-title">{addr.slice(0, 8)}...{addr.slice(-8)}</div>
										<div className="block3d-range">{b.hexRangeStart.slice(0, 8)}...{b.hexRangeStart.slice(-4)} → {b.hexRangeEnd.slice(0, 8)}...{b.hexRangeEnd.slice(-4)}</div>
										<div className="block3d-difficulty">{lenLabel}</div>
										<div className="block3d-meta">
											<span className="time">{fmtAgo(b.completedAt)}</span>
											<span className="credits">{Number(b.creditsAwarded ?? 0).toFixed(3)}</span>
										</div>
									</div>
								</div>
							</div>
						)
					})}
				</div>
			</div>
			<style jsx>{`
        .full-bleed { width: 100vw; position: relative; left: 50%; transform: translateX(-50%); }
        .timeline-container { height: 220px; }
        .timeline-track { display: flex; width: max-content; padding: 16px; }
        .timeline-track.forward { animation-name: marquee; animation-timing-function: linear; animation-iteration-count: infinite; }
        .timeline-track.reverse { animation-name: marqueeReverse; animation-timing-function: linear; animation-iteration-count: infinite; }
        @keyframes marquee { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        @keyframes marqueeReverse { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        .block3d { position: relative; width: 180px; height: 180px; cursor: pointer; margin-left: 12px; margin-top: 12px; }
        .block3d-content { 
          position: relative; 
          width: 100%; 
          height: 100%; 
          border-radius: 8px; 
          background: #ffffff;
          border: 1px solid #e5e7eb; 
          box-shadow: 0 2px 4px rgba(0,0,0,.08);
          transition: transform .2s ease, box-shadow .2s ease; 
        }
        .block3d:before { 
          content: ''; 
          position: absolute; 
          top: -4px; 
          left: -4px; 
          width: 100%; 
          height: 100%; 
          background: #4b4b4b;
          border-radius: 8px; 
          z-index: -1;
        }
        .block3d:hover .block3d-content { 
          transform: translate(2px, 2px); 
          box-shadow: 0 4px 8px rgba(0,0,0,.12); 
        }

        

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
