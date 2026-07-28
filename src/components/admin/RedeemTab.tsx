'use client'
import { useState, useEffect, useCallback } from 'react'
import { formatAddress, formatBitcoinAddress } from '@/lib/utils'
import { Coins, CheckCircle2, XCircle, CheckCircle, Search, RotateCw } from 'lucide-react'

type RedeemItem = {
	id: string
	userTokenId: string
	address: string
	puzzleAddress?: string
	amount: number
	status: string
	createdAt: string | null
	approvedAt?: string | null
	updatedAt?: string | null
	sharePercent?: number
	estimatedBtc?: number
	estimatedUsd?: number
}

const STATUS_STYLE: Record<string, string> = {
	PAID: 'volt-badge-success',
	APPROVED: 'volt-badge-accent',
	PENDING: 'volt-badge-neutral',
	DENIED: 'volt-badge-danger',
	CANCELED: 'volt-badge-neutral',
}

function timeAgo(s: string | null) {
	if (!s) return '-'
	const sec = Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 1000))
	if (sec < 60) return `${sec}s ago`
	const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`
	const hr = Math.floor(min / 60); if (hr < 24) return `${hr}h ago`
	return `${Math.floor(hr / 24)}d ago`
}

const inputCls = 'w-full bg-transparent outline-none text-[13px] placeholder:text-[#3d3c38]'

export function RedeemTab() {
	const [redeemItems, setRedeemItems] = useState<RedeemItem[]>([])
	const [redeemLoading, setRedeemLoading] = useState(false)
	const [redeemMsg, setRedeemMsg] = useState('')
	const [redeemStatusFilter, setRedeemStatusFilter] = useState('')
	const [redeemPuzzleFilter, setRedeemPuzzleFilter] = useState('')

	const fetchRedeems = useCallback(async () => {
		setRedeemLoading(true)
		try {
			const sp = new URLSearchParams()
			if (redeemStatusFilter) sp.set('status', redeemStatusFilter)
			if (redeemPuzzleFilter) sp.set('puzzleAddress', redeemPuzzleFilter)
			const r = await fetch(`/api/admin/redeem${sp.toString() ? `?${sp.toString()}` : ''}`)
			if (r.ok) {
				const j = await r.json()
				const raw = Array.isArray(j.items) ? (j.items as Record<string, unknown>[]) : []
				setRedeemItems(raw.map(it => ({
					id: String(it.id),
					userTokenId: String(it.userTokenId),
					address: String(it.address),
					puzzleAddress: it.puzzleAddress ? String(it.puzzleAddress) : '',
					amount: Number(it.amount || 0),
					status: String(it.status || 'PENDING'),
					createdAt: it.createdAt ? String(it.createdAt) : null,
					approvedAt: it.approvedAt ? String(it.approvedAt) : null,
					updatedAt: it.updatedAt ? String(it.updatedAt) : null,
					sharePercent: Number(it.sharePercent || 0),
					estimatedBtc: Number(it.estimatedBtc || 0),
					estimatedUsd: Number(it.estimatedUsd || 0),
				})))
			}
		} catch { } finally { setRedeemLoading(false) }
	}, [redeemStatusFilter, redeemPuzzleFilter])

	useEffect(() => { fetchRedeems() }, [fetchRedeems])

	async function redeemAction(id: string, action: 'approve' | 'deny' | 'paid' | 'cancel') {
		setRedeemMsg('')
		try {
			const r = await fetch(`/api/admin/redeem/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action }),
			})
			const j = await r.json().catch(() => ({}))
			if (!r.ok) { setRedeemMsg(String(j?.error || 'Action failed')); return }
			const newStatus = { approve: 'APPROVED', deny: 'DENIED', paid: 'PAID', cancel: 'CANCELED' }[action]
			setRedeemItems(prev => prev.map(it => it.id === id ? { ...it, status: newStatus, updatedAt: new Date().toISOString() } : it))
			setRedeemMsg({ approve: 'Approved.', deny: 'Denied.', paid: 'Marked as paid.', cancel: 'Cancelled.' }[action])
		} catch { setRedeemMsg('Action failed') }
	}

	return (
		<div className="volt-card">
			<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
				<div className="flex items-center gap-2 mb-1">
					<Coins className="h-4 w-4" style={{ color: '#fc5c04' }} />
					<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>Redemption Requests</span>
				</div>
				<p className="text-[12.5px]" style={{ color: '#5c5a55' }}>Approve or deny user reward redemption requests.</p>
			</div>
			<div className="px-6 py-5 space-y-4">
				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
					<span className="text-[12.5px] shrink-0" style={{ color: '#5c5a55' }}>{redeemLoading ? 'Loading…' : `${redeemItems.length} request(s)`}</span>
					<div className="flex flex-wrap items-center gap-2 flex-1">
						<select
							value={redeemStatusFilter}
							onChange={e => setRedeemStatusFilter(e.target.value)}
							className="h-9 px-3 text-[12.5px] rounded-xl outline-none"
							style={{ background: '#191919', border: '1px solid #262624', color: '#9a9892' }}
						>
							<option value="">All Status</option>
							{['PENDING', 'APPROVED', 'PAID', 'DENIED', 'CANCELED'].map(s => <option key={s} value={s}>{s}</option>)}
						</select>
						<div className="volt-input-wrap flex-1 min-w-40 h-9">
							<input className={inputCls} placeholder="Filter by puzzle address" value={redeemPuzzleFilter} onChange={e => setRedeemPuzzleFilter(e.target.value)} />
						</div>
						<button className="volt-btn-ghost p-2 h-9" onClick={fetchRedeems} disabled={redeemLoading}>
							{redeemLoading ? <RotateCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
						</button>
					</div>
				</div>
				{redeemMsg && (
					<p className="text-[12.5px]" style={{ color: redeemMsg.includes('.') && !redeemMsg.toLowerCase().includes('fail') ? '#3ddc84' : '#f0554a' }}>{redeemMsg}</p>
				)}
				<div className="overflow-x-auto">
					<table className="w-full text-[12px]">
						<thead>
							<tr style={{ borderBottom: '1px solid #262624' }}>
								{['Token', 'Address', 'Puzzle', 'Amount', 'Est. BTC', 'Share %', 'Status', 'Requested', 'Actions'].map(h => (
									<th key={h} className="px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{h}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{redeemItems.map(it => (
								<tr key={it.id} style={{ borderBottom: '1px solid #262624' }}>
									<td className="px-3 py-3 font-mono" style={{ color: '#9a9892' }}>{formatAddress(it.userTokenId)}</td>
									<td className="px-3 py-3 font-mono max-w-xs truncate" style={{ color: '#fc5c04' }}>{formatBitcoinAddress(it.address)}</td>
									<td className="px-3 py-3 font-mono max-w-xs truncate" style={{ color: '#5c5a55' }}>{it.puzzleAddress ? formatBitcoinAddress(it.puzzleAddress) : '—'}</td>
									<td className="px-3 py-3 font-semibold" style={{ color: '#f4f3ee' }}>{it.amount.toFixed(3)}</td>
									<td className="px-3 py-3 font-mono" style={{ color: '#9a9892' }}>{Number(it.estimatedBtc || 0).toFixed(8)}</td>
									<td className="px-3 py-3" style={{ color: '#9a9892' }}>{(it.sharePercent || 0).toFixed(2)}%</td>
									<td className="px-3 py-3"><span className={STATUS_STYLE[it.status] ?? 'volt-badge-neutral'}>{it.status}</span></td>
									<td className="px-3 py-3" style={{ color: '#5c5a55' }}>{it.createdAt ? timeAgo(it.createdAt) : '—'}</td>
									<td className="px-3 py-3">
										<div className="flex items-center gap-1">
											{it.status === 'PENDING' && <>
												<button onClick={() => redeemAction(it.id, 'approve')} className="volt-btn-ghost text-[11px] px-2 py-1" style={{ color: '#3ddc84' }} title="Approve"><CheckCircle2 className="h-3.5 w-3.5" /></button>
												<button onClick={() => redeemAction(it.id, 'deny')} className="volt-btn-ghost text-[11px] px-2 py-1" style={{ color: '#f0554a' }} title="Deny"><XCircle className="h-3.5 w-3.5" /></button>
											</>}
											{it.status === 'APPROVED' && <>
												<button onClick={() => redeemAction(it.id, 'paid')} className="volt-btn-ghost text-[11px] px-2 py-1" style={{ color: '#fc5c04' }} title="Mark Paid"><CheckCircle className="h-3.5 w-3.5" /></button>
												<button onClick={() => redeemAction(it.id, 'cancel')} className="volt-btn-ghost text-[11px] px-2 py-1" style={{ color: '#9a9892' }} title="Cancel"><XCircle className="h-3.5 w-3.5" /></button>
											</>}
										</div>
									</td>
								</tr>
							))}
							{redeemItems.length === 0 && !redeemLoading && (
								<tr><td colSpan={9} className="px-3 py-8 text-center text-[13px]" style={{ color: '#5c5a55' }}>No requests found.</td></tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	)
}
