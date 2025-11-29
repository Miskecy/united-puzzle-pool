'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Settings, Database, Download, Upload, Edit3, Trash2, CheckCircle2, Key, Hash, CheckCircle, XCircle, Copy, Shield, RotateCw } from 'lucide-react'

type Item = { id: string; name?: string | null; address: string; startHex: string; endHex: string; active?: boolean; solved?: boolean; privateKey?: string | null }

export default function SetupConfigPage() {
	const [items, setItems] = useState<Item[]>([])
	const [name, setName] = useState('')
	const [address, setAddress] = useState('')
	const [startHex, setStartHex] = useState('')
	const [endHex, setEndHex] = useState('')
	const [addMsg, setAddMsg] = useState('')
	const [puzzlesMsg, setPuzzlesMsg] = useState('')
	const [restoreMsg, setRestoreMsg] = useState('')
	const [solved, setSolved] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [editName, setEditName] = useState('')
	const [editAddress, setEditAddress] = useState('')
	const [editStartHex, setEditStartHex] = useState('')
	const [editEndHex, setEditEndHex] = useState('')
	const [editSolved, setEditSolved] = useState(false)
	const [restoring, setRestoring] = useState(false)
	const [restoreFile, setRestoreFile] = useState<File | null>(null)
	const [copiedActive, setCopiedActive] = useState(false)
	const [copiedId, setCopiedId] = useState<string | null>(null)
	const [sharedApiEnabled, setSharedApiEnabled] = useState<boolean>(false)
	const [sharedMsg, setSharedMsg] = useState('')

	function strip0x(s: string) { return s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s }
	function isHex(s: string) { return /^[0-9a-fA-F]+$/.test(strip0x(s)) }
	function hexToBigInt(h: string): bigint | null { try { const clean = strip0x(h); if (!isHex(clean)) return null; return BigInt('0x' + clean.toLowerCase()) } catch { return null } }
	function bitLen(h: string): number | null { const bi = hexToBigInt(h); return bi !== null ? bi.toString(2).length : null }
	function bitRangeLabel(start: string, end: string): string {
		const s = bitLen(start)
		const e = bitLen(end)
		const sExp = typeof s === 'number' ? Math.max(0, s - 1) : null
		const eExp = typeof e === 'number' ? e : null
		if (sExp !== null && eExp !== null) return `Key Range (Bits): 2^${sExp}…2^${eExp}`
		return 'Key Range (Bits): -'
	}

	const addValid = (() => {
		const s = hexToBigInt(startHex)
		const e = hexToBigInt(endHex)
		return !!(address && s !== null && e !== null && s < e)
	})()
	const addError = (() => {
		if (!address) return 'Address required'
		const s = hexToBigInt(startHex)
		const e = hexToBigInt(endHex)
		if (s === null || e === null) return 'Start and End must be hex'
		if (s >= e) return 'Start must be less than End'
		return ''
	})()

	const editValid = (() => {
		const s = hexToBigInt(editStartHex)
		const e = hexToBigInt(editEndHex)
		return !!(editAddress && s !== null && e !== null && s < e)
	})()

	// no-op

	useEffect(() => {
		(async () => {
			try {
				const r = await fetch('/api/config')
				if (!r.ok) return
				const j = await r.json()
				setItems(Array.isArray(j) ? j : [])
			} catch { }
			try {
				const rr = await fetch('/api/app/config')
				if (rr.ok) { const jj = await rr.json(); setSharedApiEnabled(!!jj?.shared_pool_api_enabled) }
			} catch { }
		})()
	}, [])

	async function addPuzzle(e: React.FormEvent) {
		e.preventDefault()
		setAddMsg('')
		if (!addValid) { setAddMsg(addError || 'Invalid input'); return }
		const r = await fetch('/api/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, address, startHex, endHex, solved })
		})
		if (r.ok) {
			setName(''); setAddress(''); setStartHex(''); setEndHex(''); setSolved(false)
			const j = await r.json()
			setItems([j, ...items])
			setAddMsg('Puzzle added successfully!')
		} else {
			setAddMsg('Failed to add')
		}
	}

	async function setActive(id: string) {
		const r = await fetch('/api/config/active', {
			method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
		})
		if (r.ok) {
			const j = await r.json()
			setItems(items.map(i => ({ ...i, active: i.id === j.id })))
			setPuzzlesMsg('Active puzzle updated')
		} else {
			setPuzzlesMsg('Failed to set active')
		}
	}

	function startEdit(i: Item) {
		setEditingId(i.id)
		setEditName(i.name || '')
		setEditAddress(i.address)
		setEditStartHex(i.startHex)
		setEditEndHex(i.endHex)
		setEditSolved(!!i.solved)
	}

	function cancelEdit() {
		setEditingId(null)
		setEditName('')
		setEditAddress('')
		setEditStartHex('')
		setEditEndHex('')
		setEditSolved(false)
	}

	async function saveEdit(id: string) {
		setPuzzlesMsg('')
		if (!editValid) { setPuzzlesMsg('Invalid range'); return }
		const r = await fetch(`/api/config/${encodeURIComponent(id)}`, {
			method: 'PATCH', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: editName, address: editAddress, startHex: editStartHex, endHex: editEndHex, solved: editSolved })
		})
		if (r.ok) {
			const j = await r.json()
			setItems(items.map(it => it.id === id ? j : it))
			cancelEdit()
			setPuzzlesMsg('Puzzle updated')
		} else {
			setPuzzlesMsg('Failed to update')
		}
	}

	async function deleteItem(id: string) {
		setPuzzlesMsg('')
		const target = items.find(it => it.id === id)
		const isActive = !!target?.active
		const promptMsg = isActive ? 'This is the active puzzle. Are you sure you want to delete it?' : 'Delete this puzzle?'
		const ok = typeof window !== 'undefined' ? window.confirm(promptMsg) : true
		if (!ok) return
		const r = await fetch(`/api/config/${encodeURIComponent(id)}${isActive ? '?force=true' : ''}`, {
			method: 'DELETE'
		})
		if (r.ok) {
			setItems(items.filter(it => it.id !== id))
			if (editingId === id) cancelEdit()
			setPuzzlesMsg('Puzzle deleted')
		} else {
			setPuzzlesMsg('Failed to delete')
		}
	}

	// Função para tratar o PATCH do Shared API
	async function toggleSharedApi(checked: boolean) {
		setSharedMsg('Updating...')
		try {
			const r = await fetch('/api/app/config', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ shared_pool_api_enabled: checked })
			})
			if (r.ok) {
				const j = await r.json();
				setSharedApiEnabled(!!j?.shared_pool_api_enabled);
				setSharedMsg(checked ? 'Shared API Enabled!' : 'Shared API Disabled.');
			} else {
				setSharedMsg('Failed to update setting.');
			}
		} catch {
			setSharedMsg('Failed to update setting.');
		}
	}


	return (
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

				{/* Header Padronizado */}
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 border-b border-gray-200 pb-4">
					<div className="flex items-center gap-3">
						<div className="p-3 bg-blue-100 rounded-full">
							<Settings className="h-6 w-6 text-blue-600" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-gray-900">Puzzle Configuration</h1>
							<div className="text-sm text-gray-600 mt-0.5">Manage active puzzle, ranges, and system settings.</div>
						</div>
					</div>
					<div className="mt-3 sm:mt-0">
						<Badge className={`font-semibold ${sharedApiEnabled ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`}>
							{sharedApiEnabled ? 'Shared API: Enabled' : 'Shared API: Disabled'}
						</Badge>
					</div>
				</div>

				{/* Database Backup & Restore */}
				<Card className="mb-6 bg-white border-gray-200 shadow-md hover:shadow-lg transition-shadow">
					<CardHeader className='border-b pb-4'>
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg"><Database className="h-5 w-5 text-blue-600" />Database Backup & Restore</CardTitle>
						<CardDescription className="text-gray-600">Safely export the database for backup, or restore from a previously saved file. Restoring will replace the current database.</CardDescription>
					</CardHeader>
					<CardContent className='pt-6'>
						<div className="flex flex-col md:flex-row items-start md:items-center gap-4">
							<Button
								type="button"
								className="bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2 w-full md:w-auto"
								onClick={async () => {
									try {
										const r = await fetch('/api/config/backup')
										if (!r.ok) return
										const blob = await r.blob()
										const url = URL.createObjectURL(blob)
										const a = document.createElement('a')
										a.href = url
										a.download = 'dev.db'
										document.body.appendChild(a)
										a.click()
										a.remove()
										URL.revokeObjectURL(url)
									} catch { }
								}}
							>
								<Download className="h-4 w-4" /> Download Backup
							</Button>
							<div className="flex flex-col md:flex-row items-start md:items-center gap-3 w-full md:w-auto">
								<Input
									type="file"
									accept=".db,application/octet-stream"
									onChange={e => setRestoreFile(e.target.files?.[0] || null)}
									className="bg-gray-50 border-gray-300 flex-1"
								/>
								<Button
									type="button"
									disabled={!restoreFile || restoring}
									className={`inline-flex items-center gap-2 w-full md:w-auto ${!restoreFile || restoring ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
									onClick={async () => {
										if (!restoreFile) return
										setRestoring(true)
										setRestoreMsg('')
										try {
											const fd = new FormData()
											fd.append('file', restoreFile)
											const r = await fetch('/api/config/backup', { method: 'POST', body: fd })
											if (r.ok) {
												setRestoreMsg('Database restored successfully! Reloading data...')
												// Reload items and data (simplified logic for client-side reload)
												setTimeout(() => window.location.reload(), 1500);
											} else { setRestoreMsg('Restore failed') }
										} catch { setRestoreMsg('Restore failed') }
										finally { setRestoring(false); setRestoreFile(null) }
									}}
								>
									{restoring ? <RotateCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {restoring ? 'Restoring...' : 'Restore Backup'}
								</Button>
							</div>
						</div>
						{restoreMsg && <div className="text-sm text-gray-700 mt-2">{restoreMsg}</div>}
					</CardContent>
				</Card>

				{/* Shared Pool API Settings */}
				<Card className="mb-6 bg-white border-gray-200 shadow-md hover:shadow-lg transition-shadow">
					<CardHeader className='border-b pb-4'>
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg"><Shield className="h-5 w-5 text-purple-600" />Shared Pool API</CardTitle>
						<CardDescription className="text-gray-600">Enable or disable the shared pool API for external integrations. This allows other pools to query validation status and submit solutions.</CardDescription>
					</CardHeader>
					<CardContent className='pt-6'>
						<div className="flex items-center gap-3">
							<label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
								<input
									type="checkbox"
									checked={sharedApiEnabled}
									onChange={(e) => toggleSharedApi(e.target.checked)}
									className="h-5 w-5 rounded accent-blue-600 focus:ring-blue-500"
								/>
								<Badge
									className={`font-semibold ${sharedApiEnabled ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`}
								>
									{sharedApiEnabled ? 'Status: Enabled' : 'Status: Disabled'}
								</Badge>
							</label>
							{sharedMsg && <span className="text-sm text-gray-600">{sharedMsg}</span>}
						</div>
					</CardContent>
				</Card>

				{/* Active Puzzle (Consolidado) */}
				{(() => {
					const active = items.find(i => i.active)
					if (!active) return null
					return (
						<Card className="mb-6 bg-blue-50 border-blue-300 shadow-md">
							<CardHeader className='border-b border-blue-300 pb-4'>
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg"><Key className="h-5 w-5 text-blue-600" />Active Puzzle</CardTitle>
								<CardDescription className="text-gray-700">This puzzle is currently active across the site and API.</CardDescription>
							</CardHeader>
							<CardContent className='pt-6'>
								<div className="flex items-center gap-2 mb-3">
									<Badge className="bg-blue-600 text-white font-semibold">Active</Badge>
									{active.solved ? (
										<Badge className="inline-flex items-center gap-1 bg-green-100 text-green-700 border border-green-300"><CheckCircle className="h-3 w-3" />Solved</Badge>
									) : (
										<Badge className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 border border-yellow-300"><XCircle className="h-3 w-3" />Not solved</Badge>
									)}
									<span className="text-sm text-gray-700 font-medium ml-auto">{active.name || '(unnamed)'}</span>
								</div>
								<div className="text-sm text-gray-700 mb-2">{bitRangeLabel(active.startHex, active.endHex)}</div>

								<div className='space-y-1 p-3 bg-white border border-gray-200 rounded-lg'>
									<div className="text-xs text-gray-600 font-mono flex items-center justify-between">address: <span className="text-blue-600 break-all">{active.address}</span></div>
									<div className="text-xs text-gray-600 font-mono flex items-center justify-between">start: <span className='break-all'>{active.startHex}</span></div>
									<div className="text-xs text-gray-600 font-mono flex items-center justify-between">end: <span className='break-all'>{active.endHex}</span></div>
								</div>

								{active.privateKey ? (
									<div className="mt-4 p-3 bg-green-50 border border-green-300 rounded-lg flex flex-col gap-2">
										<h4 className="text-green-700 font-semibold text-sm">Solution Key Found:</h4>
										<div className='flex items-center justify-between'>
											<code className="text-green-800 font-mono text-xs break-all flex-1 pr-3">{active.privateKey}</code>
											<button
												type="button"
												className="text-green-700 hover:text-green-900 text-xs inline-flex items-center gap-1 border border-green-300 rounded px-2 py-1 bg-white ml-2 shrink-0"
												onClick={async () => { try { await navigator.clipboard.writeText(active.privateKey || ''); setCopiedActive(true); setTimeout(() => setCopiedActive(false), 1500); } catch { } }}
											>
												{copiedActive ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
												<span>{copiedActive ? 'Copied' : 'Copy'}</span>
											</button>
										</div>
									</div>
								) : null}
							</CardContent>
						</Card>
					)
				})()}

				{/* Add New Puzzle */}
				<Card className="mb-6 bg-white border-gray-200 shadow-md hover:shadow-lg transition-shadow">
					<CardHeader className='border-b pb-4'>
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg"><Hash className="h-5 w-5 text-blue-600" />Add New Puzzle</CardTitle>
						<CardDescription className="text-gray-600">Create a puzzle by setting its address and key range in hex. You can mark it as solved if known.</CardDescription>
					</CardHeader>
					<CardContent className='pt-6'>
						<form onSubmit={addPuzzle} className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<Input placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} className="bg-gray-50 border-gray-300" />
							<Input placeholder="Puzzle Address" value={address} onChange={e => setAddress(e.target.value)} className="bg-gray-50 border-gray-300" />
							<Input placeholder="Start Range (hex)" value={startHex} onChange={e => setStartHex(e.target.value)} className="bg-gray-50 border-gray-300" />
							<Input placeholder="End Range (hex)" value={endHex} onChange={e => setEndHex(e.target.value)} className="bg-gray-50 border-gray-300" />
							<div className="md:col-span-2 flex items-center gap-2">
								<input id="solved" type="checkbox" checked={solved} onChange={e => setSolved(e.target.checked)} className="h-4 w-4 accent-blue-600" />
								<label htmlFor="solved" className="text-sm text-gray-700">Puzzle solved</label>
							</div>
							<div className="md:col-span-2 flex items-center gap-3">
								<Button type="submit" disabled={!addValid} className={addValid ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-400 text-white cursor-not-allowed'}>
									Add Puzzle
								</Button>
								{(!addValid && addError) && <span className="text-sm text-red-600 font-medium">{addError}</span>}
								{addMsg && <span className="text-sm text-green-600 font-medium">{addMsg}</span>}
							</div>
						</form>
					</CardContent>
				</Card>

				{/* Puzzle List & Management */}
				<Card className="bg-white border-gray-200 shadow-md hover:shadow-lg transition-shadow">
					<CardHeader className='border-b pb-4'>
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg"><Key className="h-5 w-5 text-blue-600" />All Puzzles ({items.length})</CardTitle>
						<CardDescription className="text-gray-600">Manage existing puzzles: set active, edit details, or delete entries.</CardDescription>
					</CardHeader>
					<CardContent className='pt-6'>
						{puzzlesMsg && <div className="mb-4 text-sm text-gray-700">{puzzlesMsg}</div>}
						<div className="grid grid-cols-1 gap-4">
							{items.filter(i => !i.active).length === 0 && !items.find(i => i.active) && (
								<div className="text-center py-6 text-gray-600 border border-gray-200 rounded-lg bg-gray-50">No puzzles added yet.</div>
							)}

							{items.map(i => (
								<Card key={i.id} className={`bg-gray-50 border ${i.active ? 'border-green-400 shadow-lg' : 'border-gray-200'} transition-shadow`}>
									<CardHeader className='pb-3'>
										<div className="flex items-start justify-between">
											<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
												{i.active && <Badge className="bg-green-600 text-white font-semibold mr-1">Active</Badge>}
												{i.name || '(unnamed)'}
											</CardTitle>
											<div className="flex items-center gap-2">
												{i.solved ? (
													<Badge className="inline-flex items-center gap-1 bg-green-100 text-green-700 border border-green-300"><CheckCircle className="h-3 w-3" />Solved</Badge>
												) : (
													<Badge className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 border border-yellow-300"><XCircle className="h-3 w-3" />Unsolved</Badge>
												)}
												{!i.active && (
													<Button onClick={() => setActive(i.id)} className="bg-blue-600 text-white hover:bg-blue-700 h-8 text-sm px-3">Set Active</Button>
												)}
											</div>
										</div>
										<CardDescription className="text-gray-600 pt-1">
											<code className="text-blue-600 font-mono text-sm break-all">{i.address}</code>
										</CardDescription>
									</CardHeader>
									<CardContent className='pt-3'>
										{editingId === i.id ? (
											/* Edição */
											<div className="p-4 bg-white border border-gray-300 rounded-lg shadow-inner">
												<h4 className='text-md font-semibold text-gray-900 mb-3'>Editing: {i.name || i.address.slice(0, 8)}...</h4>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
													<Input placeholder="Name (optional)" value={editName} onChange={e => setEditName(e.target.value)} className="bg-gray-50 border-gray-300" />
													<Input placeholder="Puzzle Address" value={editAddress} onChange={e => setEditAddress(e.target.value)} className="bg-gray-50 border-gray-300" />
													<Input placeholder="Start Range (hex)" value={editStartHex} onChange={e => setEditStartHex(e.target.value)} className="bg-gray-50 border-gray-300" />
													<Input placeholder="End Range (hex)" value={editEndHex} onChange={e => setEditEndHex(e.target.value)} className="bg-gray-50 border-gray-300" />
													<div className="md:col-span-2 flex items-center gap-2">
														<input id={`edit-solved-${i.id}`} type="checkbox" checked={editSolved} onChange={e => setEditSolved(e.target.checked)} className="h-4 w-4 accent-blue-600" />
														<label htmlFor={`edit-solved-${i.id}`} className="text-sm text-gray-700">Puzzle solved</label>
													</div>
													<div className="md:col-span-2 flex items-center gap-2 mt-2">
														<Button onClick={() => saveEdit(i.id)} disabled={!editValid} className={!editValid ? 'bg-gray-400 text-white' : 'bg-green-600 text-white hover:bg-green-700'}>
															<CheckCircle2 className="h-4 w-4 mr-2" /> Save Changes
														</Button>
														<Button onClick={cancelEdit} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100">Cancel</Button>
													</div>
												</div>
											</div>
										) : (
											/* Visualização */
											<>
												<div className="text-sm text-gray-700 mb-2">{bitRangeLabel(i.startHex, i.endHex)}</div>
												<div className="text-xs text-gray-600 font-mono">start: {i.startHex}</div>
												<div className="text-xs text-gray-600 font-mono mb-2">end: {i.endHex}</div>

												{i.privateKey && (
													<div className="mt-2 p-2 bg-green-50 border border-green-300 rounded-lg flex items-center justify-between">
														<code className="text-green-800 font-mono text-xs break-all flex-1 pr-3">Solution: {i.privateKey}</code>
														<button
															type="button"
															className="text-green-700 hover:text-green-900 text-xs inline-flex items-center gap-1 border border-green-300 rounded px-2 py-1 bg-white ml-2 shrink-0"
															onClick={async () => { try { await navigator.clipboard.writeText(i.privateKey || ''); setCopiedId(i.id); setTimeout(() => setCopiedId(null), 1500); } catch { } }}
														>
															{copiedId === i.id ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
															<span>{copiedId === i.id ? 'Copied' : 'Copy Key'}</span>
														</button>
													</div>
												)}

												<div className="mt-3 flex items-center gap-2">
													<Button onClick={() => startEdit(i)} variant="outline" className="inline-flex items-center gap-2 border-gray-300 text-gray-700 hover:bg-gray-100">
														<Edit3 className="h-4 w-4 text-blue-600" /> Edit Details
													</Button>
													<Button onClick={() => deleteItem(i.id)} variant="destructive" className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700">
														<Trash2 className="h-4 w-4" /> Delete
													</Button>
												</div>
											</>
										)}
									</CardContent>
								</Card>
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
