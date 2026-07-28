'use client'
import { useState, useEffect } from 'react'
import { formatCompactHexRange } from '@/lib/formatRange'
import { List, Clock, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react'

type Block = {
	id: string
	startRange: string
	endRange: string
	createdAt: string
	completedAt: string | null
	positionPercent?: number
}

function timeAgo(s: string | null) {
	if (!s) return '-'
	const sec = Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 1000))
	if (sec < 60) return `${sec}s ago`
	const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`
	const hr = Math.floor(min / 60); if (hr < 24) return `${hr}h ago`
	return `${Math.floor(hr / 24)}d ago`
}

const BlockCard = ({ block }: { block: Block }) => {
	const pct = block.positionPercent
	const pctStyle = pct === undefined ? 'volt-badge-neutral' : pct < 50 ? 'volt-badge-success' : pct < 90 ? 'volt-badge-accent' : 'volt-badge-danger'
	return (
		<div className="volt-card p-4 flex flex-col gap-2">
			<div className="flex items-start justify-between gap-2">
				<div>
					<div className="flex items-center gap-1 text-[11.5px] font-semibold mb-1" style={{ color: '#5c5a55' }}>
						<List className="h-3 w-3" style={{ color: '#fc5c04' }} /> Block ID
					</div>
					<code className="text-[11px] font-mono break-all" style={{ color: '#9a9892' }}>{formatCompactHexRange(block.id)}</code>
				</div>
				<span className={pctStyle}>{pct !== undefined ? `${pct.toFixed(2)}%` : '—'}</span>
			</div>
			<div className="rounded-xl p-2 space-y-1" style={{ background: '#131313', border: '1px solid #262624' }}>
				<div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>Start</div>
				<code className="text-[10px] font-mono break-all" style={{ color: '#9a9892' }}>{formatCompactHexRange(block.startRange)}</code>
			</div>
			<div className="rounded-xl p-2 space-y-1" style={{ background: '#131313', border: '1px solid #262624' }}>
				<div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>End</div>
				<code className="text-[10px] font-mono break-all" style={{ color: '#9a9892' }}>{formatCompactHexRange(block.endRange)}</code>
			</div>
			<div className="flex justify-between items-center pt-1 text-[11.5px]" style={{ borderTop: '1px solid #262624', color: '#5c5a55' }}>
				<span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Completed</span>
				<span style={{ color: '#9a9892' }}>{block.completedAt ? timeAgo(block.completedAt) : '—'}</span>
			</div>
		</div>
	)
}

const BlockCardSkeleton = () => (
	<div className="volt-card p-4 animate-pulse h-52">
		<div className="space-y-2">
			<div className="h-4 rounded" style={{ background: '#191919', width: '60%' }} />
			<div className="h-10 rounded-xl" style={{ background: '#191919' }} />
			<div className="h-10 rounded-xl" style={{ background: '#191919' }} />
			<div className="h-3 rounded" style={{ background: '#191919', width: '40%' }} />
		</div>
	</div>
)

export function BlocksTab() {
	const [blocks, setBlocks] = useState<Block[]>([])
	const [blocksPage, setBlocksPage] = useState(1)
	const [blocksTotal, setBlocksTotal] = useState(0)
	const [blocksLoading, setBlocksLoading] = useState(false)

	async function fetchBlocks(page = 1) {
		setBlocksLoading(true)
		try {
			const r = await fetch(`/api/pool/blocks?page=${page}&pageSize=50`)
			if (r.ok) {
				const j = await r.json()
				setBlocks(Array.isArray(j.items) ? j.items : [])
				setBlocksTotal(Number(j.total || 0))
				setBlocksPage(Number(j.page || 1))
			}
		} catch { } finally { setBlocksLoading(false) }
	}

	useEffect(() => { fetchBlocks(1) }, [])

	const totalPages = Math.ceil(blocksTotal / 50)

	return (
		<div className="volt-card">
			<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
				<div>
					<div className="flex items-center gap-2">
						<List className="h-4 w-4" style={{ color: '#fc5c04' }} />
						<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>Recent Blocks</span>
						<span className="volt-badge-neutral">Total: {blocksTotal}</span>
					</div>
					<p className="text-[12.5px] mt-1" style={{ color: '#5c5a55' }}>Last 50 completed blocks per page.</p>
				</div>
				<button className="volt-btn-ghost" onClick={() => fetchBlocks(blocksPage)} disabled={blocksLoading}>
					<RotateCw className={`h-4 w-4 ${blocksLoading ? 'animate-spin' : ''}`} />
				</button>
			</div>
			<div className="px-6 py-5">
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{blocksLoading
						? Array.from({ length: 6 }).map((_, i) => <BlockCardSkeleton key={i} />)
						: blocks.length === 0
							? <div className="col-span-full text-center py-8 text-[13px]" style={{ color: '#5c5a55' }}>No blocks data.</div>
							: blocks.map(b => <BlockCard key={b.id} block={b} />)
					}
				</div>
				<div className="flex items-center justify-between mt-5">
					<span className="text-[12.5px]" style={{ color: '#5c5a55' }}>Showing {blocks.length} of {blocksTotal}</span>
					<div className="flex items-center gap-2">
						<button className="volt-btn-ghost p-2" disabled={blocksPage <= 1 || blocksLoading} onClick={() => fetchBlocks(blocksPage - 1)}>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<span className="text-[12.5px]" style={{ color: '#9a9892' }}>Page {blocksPage} / {totalPages || 1}</span>
						<button className="volt-btn-ghost p-2" disabled={blocksPage >= totalPages || blocksLoading} onClick={() => fetchBlocks(blocksPage + 1)}>
							<ChevronRight className="h-4 w-4" />
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
