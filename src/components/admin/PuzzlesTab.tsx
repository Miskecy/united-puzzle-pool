'use client'
import { useState, useEffect, useMemo } from 'react'
import { formatCompactHexRange } from '@/lib/formatRange'
import {
	Edit3, Trash2, CheckCircle2, Key, Hash,
	CheckCircle, XCircle, Copy, Search, Filter, AlertCircle,
} from 'lucide-react'

type Item = {
	id: string
	name?: string | null
	address: string
	startHex: string
	endHex: string
	active?: boolean
	solved?: boolean
	privateKey?: string | null
}

function strip0x(s: string) { return s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s }
function isHex(s: string) { return /^[0-9a-fA-F]+$/.test(strip0x(s)) }
function hexToBigInt(h: string): bigint | null {
	try { const c = strip0x(h); if (!isHex(c)) return null; return BigInt('0x' + c.toLowerCase()) } catch { return null }
}
function bitLen(h: string): number | null {
	const bi = hexToBigInt(h); return bi !== null ? bi.toString(2).length : null
}
function bitRangeLabel(start: string, end: string): string {
	const s = bitLen(start); const e = bitLen(end)
	const sExp = typeof s === 'number' ? Math.max(0, s - 1) : null
	const eExp = typeof e === 'number' ? e : null
	return sExp !== null && eExp !== null ? `2^${sExp}…2^${eExp}` : '-'
}

const inputCls = 'w-full bg-transparent outline-none text-[13px] placeholder:text-[#3d3c38]'

export function PuzzlesTab() {
	const [items, setItems] = useState<Item[]>([])
	const [name, setName] = useState('')
	const [address, setAddress] = useState('')
	const [startHex, setStartHex] = useState('')
	const [endHex, setEndHex] = useState('')
	const [addMsg, setAddMsg] = useState('')
	const [puzzlesMsg, setPuzzlesMsg] = useState('')
	const [solved, setSolved] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [editName, setEditName] = useState('')
	const [editAddress, setEditAddress] = useState('')
	const [editStartHex, setEditStartHex] = useState('')
	const [editEndHex, setEditEndHex] = useState('')
	const [editSolved, setEditSolved] = useState(false)
	const [copiedActive, setCopiedActive] = useState(false)
	const [copiedId, setCopiedId] = useState<string | null>(null)
	const [puzzleSearch, setPuzzleSearch] = useState('')
	const [confirmDelete, setConfirmDelete] = useState<{ id: string; isActive: boolean; name: string } | null>(null)

	const addValid = useMemo(() => {
		const s = hexToBigInt(startHex); const e = hexToBigInt(endHex)
		return !!(address && s !== null && e !== null && s < e)
	}, [address, startHex, endHex])

	const addError = useMemo(() => {
		if (!address) return 'Address required'
		const s = hexToBigInt(startHex); const e = hexToBigInt(endHex)
		if (s === null || e === null) return 'Start and End must be valid hex'
		if (s >= e) return 'Start must be less than End'
		return ''
	}, [address, startHex, endHex])

	const editValid = useMemo(() => {
		const s = hexToBigInt(editStartHex); const e = hexToBigInt(editEndHex)
		return !!(editAddress && s !== null && e !== null && s < e)
	}, [editAddress, editStartHex, editEndHex])

	useEffect(() => {
		;(async () => {
			try {
				const r = await fetch('/api/config')
				if (r.ok) { const j = await r.json(); setItems(Array.isArray(j) ? j : []) }
			} catch { }
		})()
	}, [])

	const filteredItems = useMemo(() => {
		const sorted = [...items].sort((a, b) => (b.active === a.active ? 0 : b.active ? 1 : -1))
		if (!puzzleSearch) return sorted
		const q = puzzleSearch.toLowerCase()
		return sorted.filter(i =>
			i.name?.toLowerCase().includes(q) ||
			i.address.toLowerCase().includes(q) ||
			i.startHex.toLowerCase().includes(q) ||
			i.endHex.toLowerCase().includes(q)
		)
	}, [items, puzzleSearch])

	const activePuzzle = items.find(i => i.active)

	async function addPuzzle(e: React.FormEvent) {
		e.preventDefault(); setAddMsg('')
		if (!addValid) { setAddMsg(addError || 'Invalid input'); return }
		const r = await fetch('/api/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, address, startHex, endHex, solved }),
		})
		if (r.ok) {
			setName(''); setAddress(''); setStartHex(''); setEndHex(''); setSolved(false)
			const j = await r.json(); setItems([j, ...items]); setAddMsg('Puzzle added!')
		} else setAddMsg('Failed to add puzzle.')
	}

	async function setActive(id: string) {
		const r = await fetch('/api/config/active', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id }),
		})
		if (r.ok) {
			const j = await r.json()
			setItems(items.map(i => ({ ...i, active: i.id === j.id })))
			setPuzzlesMsg('Active puzzle updated!')
		} else setPuzzlesMsg('Failed to set active.')
	}

	function startEdit(i: Item) {
		setEditingId(i.id); setEditName(i.name || '')
		setEditAddress(i.address); setEditStartHex(i.startHex)
		setEditEndHex(i.endHex); setEditSolved(!!i.solved)
	}
	function cancelEdit() {
		setEditingId(null); setEditName(''); setEditAddress('')
		setEditStartHex(''); setEditEndHex(''); setEditSolved(false)
	}

	async function saveEdit(id: string) {
		setPuzzlesMsg(''); if (!editValid) { setPuzzlesMsg('Invalid range'); return }
		const r = await fetch(`/api/config/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: editName, address: editAddress, startHex: editStartHex, endHex: editEndHex, solved: editSolved }),
		})
		if (r.ok) {
			const j = await r.json()
			setItems(items.map(it => it.id === id ? j : it))
			cancelEdit(); setPuzzlesMsg('Puzzle updated!')
		} else setPuzzlesMsg('Failed to update.')
	}

	function deleteItem(id: string) {
		const target = items.find(it => it.id === id)
		setConfirmDelete({ id, isActive: !!target?.active, name: target?.name || `Puzzle ${id.substring(0, 8)}…` })
	}

	async function confirmDeleteFn() {
		if (!confirmDelete) return
		const { id, isActive } = confirmDelete
		setConfirmDelete(null); setPuzzlesMsg('')
		const r = await fetch(`/api/config/${encodeURIComponent(id)}${isActive ? '?force=true' : ''}`, { method: 'DELETE' })
		if (r.ok) {
			setItems(items.filter(it => it.id !== id))
			if (editingId === id) cancelEdit()
			setPuzzlesMsg('Puzzle deleted!')
		} else setPuzzlesMsg('Failed to delete.')
	}

	return (
		<div className="space-y-5">
			{/* Active puzzle banner */}
			{activePuzzle && (
				<div className="volt-card" style={{ border: '1px solid rgba(252,92,4,0.3)' }}>
					<div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: '1px solid #262624' }}>
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>Currently Active</div>
							<div className="flex items-center gap-2">
								<Key className="h-4 w-4" style={{ color: '#fc5c04' }} />
								<span className="text-[19px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{activePuzzle.name || 'Active Puzzle'}</span>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span className="volt-badge-accent">ACTIVE</span>
							{activePuzzle.solved
								? <span className="volt-badge-success flex items-center gap-1"><CheckCircle className="h-3 w-3" />Solved</span>
								: <span className="volt-badge-neutral flex items-center gap-1"><XCircle className="h-3 w-3" />Unsolved</span>}
						</div>
					</div>
					<div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-[12.5px]">
						<div>
							<p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>Address</p>
							<code className="font-mono break-all" style={{ color: '#fc5c04' }}>{activePuzzle.address}</code>
						</div>
						<div>
							<p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>Key Range (Bits)</p>
							<span className="font-semibold" style={{ color: '#f4f3ee' }}>{bitRangeLabel(activePuzzle.startHex, activePuzzle.endHex)}</span>
						</div>
						<div className="md:col-span-3 space-y-1 pt-2" style={{ borderTop: '1px solid #262624' }}>
							<div className="flex items-start gap-2"><span style={{ color: '#5c5a55' }}>Start:</span><code className="font-mono text-[11px] break-all flex-1" style={{ color: '#9a9892' }}>{activePuzzle.startHex}</code></div>
							<div className="flex items-start gap-2"><span style={{ color: '#5c5a55' }}>End:</span><code className="font-mono text-[11px] break-all flex-1" style={{ color: '#9a9892' }}>{activePuzzle.endHex}</code></div>
						</div>
						{activePuzzle.privateKey && (
							<div className="md:col-span-3 flex items-center justify-between rounded-[10px] p-3 gap-3" style={{ background: '#123420', border: '1px solid rgba(61,220,132,0.3)' }}>
								<div>
									<p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#3ddc84' }}>Solution Found</p>
									<code className="font-mono text-[12px] break-all" style={{ color: '#3ddc84' }}>{activePuzzle.privateKey}</code>
								</div>
								<button className="volt-btn-ghost shrink-0" onClick={async () => { try { await navigator.clipboard.writeText(activePuzzle.privateKey || ''); setCopiedActive(true); setTimeout(() => setCopiedActive(false), 1500) } catch { } }}>
									{copiedActive ? <CheckCircle2 className="h-4 w-4" style={{ color: '#3ddc84' }} /> : <Copy className="h-4 w-4" />}
								</button>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Add puzzle form */}
			<div className="volt-card">
				<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
					<div className="flex items-center gap-2">
						<Hash className="h-4 w-4" style={{ color: '#fc5c04' }} />
						<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>Add New Puzzle</span>
					</div>
					<p className="text-[12.5px] mt-1" style={{ color: '#5c5a55' }}>Create a puzzle by setting its address and hex key range.</p>
				</div>
				<div className="px-6 py-5">
					<form onSubmit={addPuzzle} className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="md:col-span-2">
							<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>Name (optional)</label>
							<div className="volt-input-wrap"><input className={inputCls} placeholder="Puzzle name…" value={name} onChange={e => setName(e.target.value)} /></div>
						</div>
						<div className="md:col-span-2">
							<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>Puzzle Address</label>
							<div className="volt-input-wrap"><input className={inputCls} placeholder="Bitcoin address…" value={address} onChange={e => setAddress(e.target.value)} /></div>
						</div>
						<div>
							<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>Start Range (hex)</label>
							<div className="volt-input-wrap"><input className={inputCls} placeholder="0x…" value={startHex} onChange={e => setStartHex(e.target.value)} /></div>
						</div>
						<div>
							<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>End Range (hex)</label>
							<div className="volt-input-wrap"><input className={inputCls} placeholder="0x…" value={endHex} onChange={e => setEndHex(e.target.value)} /></div>
						</div>
						<div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
							<label className="flex items-center gap-2 cursor-pointer text-[12.5px]" style={{ color: '#9a9892' }}>
								<input type="checkbox" checked={solved} onChange={e => setSolved(e.target.checked)} />
								Mark as Solved
							</label>
							<div className="flex items-center gap-2">
								<button type="submit" className="volt-btn-primary" disabled={!addValid}>Add Puzzle</button>
								{!addValid && addError && <span className="text-[11.5px]" style={{ color: '#f0554a' }}>{addError}</span>}
								{addMsg && <span className="text-[11.5px]" style={{ color: addMsg.includes('!') ? '#3ddc84' : '#f0554a' }}>{addMsg}</span>}
							</div>
						</div>
					</form>
				</div>
			</div>

			{/* Puzzle list */}
			<div className="volt-card">
				<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<Key className="h-4 w-4" style={{ color: '#fc5c04' }} />
							<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>All Puzzles</span>
							<span className="volt-badge-neutral">{items.length}</span>
						</div>
						<div className="flex items-center gap-2 flex-1 max-w-xs">
							<div className="volt-input-wrap flex-1">
								<Search className="h-3.5 w-3.5 shrink-0" style={{ color: '#5c5a55' }} />
								<input className={inputCls} placeholder="Search…" value={puzzleSearch} onChange={e => setPuzzleSearch(e.target.value)} />
							</div>
							{puzzleSearch && <button className="volt-btn-ghost p-2" onClick={() => setPuzzleSearch('')}><Filter className="h-3.5 w-3.5" /></button>}
						</div>
					</div>
				</div>
				<div className="px-6 py-5 space-y-3">
					{puzzlesMsg && <p className="text-[12.5px]" style={{ color: puzzlesMsg.includes('!') ? '#3ddc84' : '#f0554a' }}>{puzzlesMsg}</p>}
					{filteredItems.length === 0 && (
						<div className="text-center py-8 text-[13px]" style={{ color: '#5c5a55' }}>
							{items.length === 0 ? 'No puzzles yet.' : 'No results.'}
						</div>
					)}
					{filteredItems.map(i => (
						<div key={i.id} className="rounded-[12px] p-4" style={{ background: '#131313', border: `1px solid ${i.active ? 'rgba(252,92,4,0.3)' : '#262624'}` }}>
							<div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
								<div className="flex-1 min-w-0 space-y-1">
									<div className="flex items-center flex-wrap gap-2">
										{i.active && <span className="volt-badge-accent">ACTIVE</span>}
										{i.solved
											? <span className="volt-badge-success flex items-center gap-1"><CheckCircle className="h-3 w-3" />Solved</span>
											: <span className="volt-badge-neutral flex items-center gap-1"><XCircle className="h-3 w-3" />Unsolved</span>}
										<span className="text-[14px] font-semibold break-all" style={{ color: '#f4f3ee' }}>{i.name || `Puzzle ${i.id.substring(0, 8)}`}</span>
									</div>
									<div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" style={{ color: '#5c5a55' }}>
										<code className="font-mono" style={{ color: '#fc5c04' }}>{i.address}</code>
										<span>Bits: <span style={{ color: '#9a9892' }}>{bitRangeLabel(i.startHex, i.endHex)}</span></span>
									</div>
									<div className="flex items-center gap-2 text-[11px] font-mono" style={{ color: '#5c5a55' }}>
										<span>{formatCompactHexRange(i.startHex)}</span>
										<span>→</span>
										<span>{formatCompactHexRange(i.endHex)}</span>
									</div>
								</div>
								{editingId === i.id ? (
									<div className="flex items-center gap-2 shrink-0">
										<button onClick={() => saveEdit(i.id)} disabled={!editValid} className="volt-btn-primary text-[12px] px-3 py-1.5">Save</button>
										<button onClick={cancelEdit} className="volt-btn-ghost text-[12px] px-3 py-1.5">Cancel</button>
									</div>
								) : (
									<div className="flex items-center gap-2 shrink-0">
										{!i.active && <button onClick={() => setActive(i.id)} className="volt-btn-primary text-[12px] px-3 py-1.5">Set Active</button>}
										<button onClick={() => startEdit(i)} className="volt-btn-ghost p-2" title="Edit"><Edit3 className="h-4 w-4" /></button>
										<button onClick={() => deleteItem(i.id)} className="volt-btn-danger p-2" title="Delete"><Trash2 className="h-4 w-4" /></button>
									</div>
								)}
							</div>
							{editingId === i.id && (
								<div className="mt-4 rounded-[10px] p-4 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: '#0a0a0a', border: '1px solid #262624' }}>
									<div className="volt-input-wrap"><input className={inputCls} placeholder="Name (optional)" value={editName} onChange={e => setEditName(e.target.value)} /></div>
									<div className="volt-input-wrap"><input className={inputCls} placeholder="Puzzle Address" value={editAddress} onChange={e => setEditAddress(e.target.value)} /></div>
									<div className="volt-input-wrap"><input className={inputCls} placeholder="Start Range (hex)" value={editStartHex} onChange={e => setEditStartHex(e.target.value)} /></div>
									<div className="volt-input-wrap"><input className={inputCls} placeholder="End Range (hex)" value={editEndHex} onChange={e => setEditEndHex(e.target.value)} /></div>
									<div className="md:col-span-2">
										<label className="flex items-center gap-2 cursor-pointer text-[12.5px]" style={{ color: '#9a9892' }}>
											<input type="checkbox" checked={editSolved} onChange={e => setEditSolved(e.target.checked)} /> Puzzle solved
										</label>
									</div>
								</div>
							)}
							{editingId !== i.id && i.privateKey && (
								<div className="mt-3 flex items-center justify-between rounded-xl p-2 gap-3" style={{ background: '#123420', border: '1px solid rgba(61,220,132,0.3)' }}>
									<code className="font-mono text-[11px] break-all flex-1" style={{ color: '#3ddc84' }}>Solution: {i.privateKey}</code>
									<button className="volt-btn-ghost p-1.5 shrink-0" onClick={async () => { try { await navigator.clipboard.writeText(i.privateKey || ''); setCopiedId(i.id); setTimeout(() => setCopiedId(null), 1500) } catch { } }}>
										{copiedId === i.id ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#3ddc84' }} /> : <Copy className="h-3.5 w-3.5" />}
									</button>
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Delete confirm modal */}
			{confirmDelete && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
					<div className="volt-card w-full max-w-sm overflow-hidden volt-pop-in">
						<div className="px-6 pt-5 pb-4 flex items-center gap-2" style={{ borderBottom: '1px solid #1e1e1c' }}>
							<Trash2 className="h-5 w-5 shrink-0" style={{ color: '#f0554a' }} />
							<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>Delete Puzzle</span>
						</div>
						<div className="px-6 py-5 space-y-2">
							<p className="text-[13px]" style={{ color: '#9a9892' }}>
								Delete <span className="font-semibold" style={{ color: '#f4f3ee' }}>{confirmDelete.name}</span>? This cannot be undone.
							</p>
							{confirmDelete.isActive && (
								<div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: '#3a1512', border: '1px solid rgba(240,85,74,0.25)', color: '#f0554a' }}>
									<AlertCircle className="h-3.5 w-3.5 shrink-0" /> This is the currently active puzzle.
								</div>
							)}
						</div>
						<div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid #1e1e1c', background: '#0f0f0e' }}>
							<button className="volt-btn-ghost px-4" onClick={() => setConfirmDelete(null)}>Cancel</button>
							<button className="volt-btn-danger px-4" onClick={confirmDeleteFn}>Delete</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
