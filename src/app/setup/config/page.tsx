'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import RouteGuard from '@/components/RouteGuard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCompactHexRange } from '@/lib/formatRange'
import { formatAddress, formatBitcoinAddress } from '@/lib/utils'
import { Settings, Database, Download, Upload, Edit3, Trash2, CheckCircle2, Key, Hash, CheckCircle, XCircle, Copy, Shield, RotateCw, List, Clock, Coins, Search, ChevronLeft, ChevronRight, Filter, MoreHorizontal, Cpu } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// --- Type Definitions (from original code) ---
type Item = { id: string; name?: string | null; address: string; startHex: string; endHex: string; active?: boolean; solved?: boolean; privateKey?: string | null }
type Block = { id: string; startRange: string; endRange: string; createdAt: string; completedAt: string | null; positionPercent?: number }
type RedeemItem = { id: string, userTokenId: string, address: string, puzzleAddress?: string, amount: number, status: string, createdAt: string | null, approvedAt?: string | null, updatedAt?: string | null, sharePercent?: number, estimatedBtc?: number, estimatedUsd?: number }

// --- Utility Functions (from original code) ---
function timeAgo(s: string | null) {
	if (!s) return '-'
	const t = new Date(s).getTime()
	const now = Date.now()
	const diff = Math.max(0, now - t)
	const sec = Math.floor(diff / 1000)
	if (sec < 60) return `${sec}s ago`
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m ago`
	const hr = Math.floor(min / 60)
	if (hr < 24) return `${hr}h ago`
	const day = Math.floor(hr / 24)
	return `${day}d ago`
}

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


function formatScaledKeysPerSecond(mkeysPerSec: number): string {
	const UNITS: Array<{ label: string; factor: bigint }> = [
		{ label: 'E', factor: 1_000_000_000_000_000_000n },
		{ label: 'P', factor: 1_000_000_000_000_000n },
		{ label: 'T', factor: 1_000_000_000_000n },
		{ label: 'B', factor: 1_000_000_000n },
		{ label: 'M', factor: 1_000_000n },
		{ label: 'K', factor: 1_000n },
		{ label: '', factor: 1n },
	]
	const kps = BigInt(Math.max(0, Math.round(Number(mkeysPerSec) * 1_000_000)))
	let idx = UNITS.findIndex(u => kps >= u.factor)
	if (idx < 0) idx = UNITS.length - 1
	while (idx > 0) {
		const u = UNITS[idx]
		const scaledInt = kps / u.factor
		if (scaledInt >= 1000n) idx -= 1
		else break
	}
	const u = UNITS[idx]
	const intPart = kps / u.factor
	const rem = kps % u.factor
	const twoDec = (rem * 100n) / u.factor
	let out: string
	if (intPart >= 100n) out = `${intPart.toString()}${u.label}Keys/s`
	else if (intPart >= 10n) out = `${intPart.toString()}.${(twoDec / 10n).toString().padStart(1, '0')}${u.label}Keys/s`
	else out = `${intPart.toString()}.${twoDec.toString().padStart(2, '0')}${u.label}Keys/s`
	const exp = Number(kps) > 0 ? Math.log2(Number(kps)) : 0
	return `${out} • 2^${exp.toFixed(2)}`
}

function SpeedCell({ m }: { m: number }) {
	return <div className="font-mono text-right text-blue-700">{formatScaledKeysPerSecond(m)}</div>
}

// --- Block Card Component (Enhanced) ---
const BlockCard: React.FC<{ block: Block }> = ({ block }) => {
	// Determine the color for the Position % badge
	const positionColor = (percent?: number) => {
		if (percent === undefined) return 'bg-gray-100 text-gray-700 border border-gray-300';
		if (percent < 50) return 'bg-green-100 text-green-700 border border-green-300';
		if (percent < 90) return 'bg-yellow-100 text-yellow-700 border border-yellow-300';
		return 'bg-red-100 text-red-700 border border-red-300';
	};

	return (
		<Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between">
					<CardTitle className="text-sm font-semibold text-gray-900 flex flex-col gap-1">
						<span className="flex items-center gap-1">
							<List className="h-4 w-4 text-blue-600" /> Block ID:
						</span>
						<code className="text-xs font-normal text-gray-600 break-all">{formatCompactHexRange(block.id)}</code>
					</CardTitle>
					<Badge className={`font-medium whitespace-nowrap ${positionColor(block.positionPercent)}`}>
						{block.positionPercent !== undefined ? `${block.positionPercent.toFixed(2)}%` : '-'}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="pt-3 space-y-2 text-xs">
				{/* Full Start Range */}
				<div className="space-y-0.5 p-2 bg-gray-50 border border-gray-200 rounded-md">
					<span className="text-gray-600 font-medium block">Start Range:</span>
					<code className="font-mono text-gray-800 break-all text-[10px] sm:text-xs">{formatCompactHexRange(block.startRange)}</code>
				</div>
				{/* Full End Range */}
				<div className="space-y-0.5 p-2 bg-gray-50 border border-gray-200 rounded-md">
					<span className="text-gray-600 font-medium block">End Range:</span>
					<code className="font-mono text-gray-800 break-all text-[10px] sm:text-xs">{formatCompactHexRange(block.endRange)}</code>
				</div>

				<div className="flex justify-between items-center pt-1 border-t border-gray-100">
					<span className="text-gray-600 flex items-center gap-1">
						<Clock className="h-4 w-4 text-green-600" /> Completed:
					</span>
					<span className="font-medium text-gray-700 text-xs">
						{block.completedAt ? timeAgo(block.completedAt) : '-'}
					</span>
				</div>
			</CardContent>
		</Card>
	);
};

// --- Block Card Skeleton Component (from original code) ---
const BlockCardSkeleton: React.FC = () => (
	<Card className="bg-gray-100 border-gray-200 shadow-sm h-52 flex flex-col justify-between animate-pulse">
		<CardHeader className="pb-2">
			<div className="flex items-start justify-between">
				<div className="space-y-1">
					<div className="h-4 w-32 bg-gray-200 rounded"></div>
					<div className="h-3 w-40 bg-gray-200 rounded"></div>
				</div>
				<div className="h-6 w-12 bg-gray-200 rounded-full"></div>
			</div>
		</CardHeader>
		<CardContent className="pt-3 space-y-2 text-xs">
			<div className="h-10 bg-gray-200 rounded-md"></div>
			<div className="h-10 bg-gray-200 rounded-md"></div>
			<div className="flex justify-between items-center pt-1">
				<div className="h-4 w-20 bg-gray-200 rounded"></div>
				<div className="h-4 w-16 bg-gray-200 rounded"></div>
			</div>
		</CardContent>
	</Card>
);

// --- Component Start ---

export default function SetupConfigPage() {
	// --- State Declarations ---
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
	const [blocks, setBlocks] = useState<Block[]>([])
	const [blocksPage, setBlocksPage] = useState(1)
	const [blocksTotal, setBlocksTotal] = useState(0)
	const [blocksLoading, setBlocksLoading] = useState(false)
	const [redeemItems, setRedeemItems] = useState<RedeemItem[]>([])
	const [redeemLoading, setRedeemLoading] = useState(false)
	const [redeemMsg, setRedeemMsg] = useState('')
	const [puzzleSearch, setPuzzleSearch] = useState('')
	const [redeemStatusFilter, setRedeemStatusFilter] = useState<string>('')
	const [redeemPuzzleFilter, setRedeemPuzzleFilter] = useState<string>('')


	const [dbStatus, setDbStatus] = useState<{ tables: number; tableNames: string[]; dbFile: string; envUrl: string; sizeBytes: number; envRaw?: string; envInPrisma?: boolean; pathMismatch?: boolean; suggestedEnvUrl?: string } | null>(null)
	const [dbStatusLoading, setDbStatusLoading] = useState(false)

	const [userGpuItems, setUserGpuItems] = useState<{ id: string; model: string; approx_keys_per_second_mkeys: number; tdp_w?: number; brand?: string; architecture?: string; series?: string; status: 'PENDING' | 'APPROVED' | 'DENIED'; createdAt: string }[]>([])
	const [userGpuLoading, setUserGpuLoading] = useState(false)
	const [userGpuMsg, setUserGpuMsg] = useState('')



	const setupSecret = typeof window !== 'undefined' ? (localStorage.getItem('setup_secret') || '') : ''

	// --- Data Fetching and Logic ---
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
		} catch { }
		finally { setBlocksLoading(false) }
	}

	async function checkDbStatus() {
		setDbStatusLoading(true)
		try {
			const r = await fetch('/api/config/backup?status=1', { headers: setupSecret ? { 'x-setup-secret': setupSecret } : undefined })
			if (r.ok) {
				const j = await r.json()
				setDbStatus({ tables: Number(j.tables || 0), tableNames: Array.isArray(j.tableNames) ? j.tableNames.map((s: unknown) => String(s)) : [], dbFile: String(j.dbFile || ''), envUrl: String(j.envUrl || ''), sizeBytes: Number(j.sizeBytes || 0), envRaw: j.envRaw ? String(j.envRaw) : undefined, envInPrisma: !!j.envInPrisma, pathMismatch: !!j.pathMismatch, suggestedEnvUrl: j.suggestedEnvUrl ? String(j.suggestedEnvUrl) : undefined })
			}
		} catch { }
		finally { setDbStatusLoading(false) }
	}

	const addValid = useMemo(() => {
		const s = hexToBigInt(startHex)
		const e = hexToBigInt(endHex)
		return !!(address && s !== null && e !== null && s < e)
	}, [address, startHex, endHex])

	const addError = useMemo(() => {
		if (!address) return 'Address required'
		const s = hexToBigInt(startHex)
		const e = hexToBigInt(endHex)
		if (s === null || e === null) return 'Start and End must be valid hex values'
		if (s >= e) return 'Start must be less than End'
		return ''
	}, [address, startHex, endHex])

	const editValid = useMemo(() => {
		const s = hexToBigInt(editStartHex)
		const e = hexToBigInt(editEndHex)
		return !!(editAddress && s !== null && e !== null && s < e)
	}, [editAddress, editStartHex, editEndHex])

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

	const fetchUserGpusAdmin = useCallback(async () => {
		setUserGpuLoading(true)
		try {
			const headers = setupSecret ? { 'x-setup-secret': setupSecret } : undefined
			const r = await fetch('/api/user-gpus', { headers })
			if (r.ok) { const j = await r.json(); setUserGpuItems(Array.isArray(j.items) ? j.items : []) }
		} catch { }
		finally { setUserGpuLoading(false) }
	}, [setupSecret])

	useEffect(() => { fetchBlocks(1) }, [])
	useEffect(() => { fetchUserGpusAdmin() }, [fetchUserGpusAdmin])

	const approvedGpuItems = useMemo(() => userGpuItems.filter(i => i.status === 'APPROVED'), [userGpuItems])
	const pendingGpuItems = useMemo(() => userGpuItems.filter(i => i.status === 'PENDING'), [userGpuItems])





	const fetchRedeems = useCallback(async () => {
		setRedeemLoading(true)
		try {
			const sp = new URLSearchParams()
			if (redeemStatusFilter) sp.set('status', redeemStatusFilter)
			if (redeemPuzzleFilter) sp.set('puzzleAddress', redeemPuzzleFilter)
			const r = await fetch(`/api/admin/redeem${sp.toString() ? `?${sp.toString()}` : ''}`, { headers: setupSecret ? { 'x-setup-secret': setupSecret } : undefined })
			if (r.ok) {
				const j = await r.json()
				const items = Array.isArray(j.items) ? (j.items as { id: unknown, userTokenId: unknown, address: unknown, puzzleAddress?: unknown, amount: unknown, status: unknown, createdAt?: unknown, approvedAt?: unknown, updatedAt?: unknown, sharePercent?: unknown, estimatedBtc?: unknown, estimatedUsd?: unknown }[]) : []
				setRedeemItems(items.map(it => ({ id: String(it.id), userTokenId: String(it.userTokenId), address: String(it.address), puzzleAddress: it.puzzleAddress ? String(it.puzzleAddress) : '', amount: Number(it.amount || 0), status: String(it.status || 'PENDING'), createdAt: it.createdAt ? String(it.createdAt) : null, approvedAt: it.approvedAt ? String(it.approvedAt) : null, updatedAt: it.updatedAt ? String(it.updatedAt) : null, sharePercent: Number(it.sharePercent || 0), estimatedBtc: Number(it.estimatedBtc || 0), estimatedUsd: Number(it.estimatedUsd || 0) })))
			}
		} catch { }
		finally { setRedeemLoading(false) }
	}, [setupSecret, redeemStatusFilter, redeemPuzzleFilter])

	useEffect(() => { fetchRedeems() }, [fetchRedeems])

	// --- Action Handlers ---
	async function approveRedeem(id: string) {
		setRedeemMsg('')
		try {
			const r = await fetch(`/api/admin/redeem/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}) }, body: JSON.stringify({ action: 'approve' }) })
			const j = await r.json().catch(() => ({}))
			if (!r.ok) { setRedeemMsg(String(j?.error || 'Failed to approve')); return }
			setRedeemItems(prev => prev.map(it => it.id === id ? { ...it, status: 'APPROVED', approvedAt: new Date().toISOString() } : it))
			setRedeemMsg('Request approved successfully!')
		} catch { setRedeemMsg('Failed to approve') }
	}
	async function denyRedeem(id: string) {
		setRedeemMsg('')
		try {
			const r = await fetch(`/api/admin/redeem/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}) }, body: JSON.stringify({ action: 'deny' }) })
			const j = await r.json().catch(() => ({}))
			if (!r.ok) { setRedeemMsg(String(j?.error || 'Failed to deny')); return }
			setRedeemItems(prev => prev.map(it => it.id === id ? { ...it, status: 'DENIED', updatedAt: new Date().toISOString() } : it))
			setRedeemMsg('Request denied.')
		} catch { setRedeemMsg('Failed to deny') }
	}
	async function markPaid(id: string) {
		setRedeemMsg('')
		try {
			const r = await fetch(`/api/admin/redeem/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}) }, body: JSON.stringify({ action: 'paid' }) })
			const j = await r.json().catch(() => ({}))
			if (!r.ok) { setRedeemMsg(String(j?.error || 'Failed to mark paid')); return }
			setRedeemItems(prev => prev.map(it => it.id === id ? { ...it, status: 'PAID', updatedAt: new Date().toISOString() } : it))
			setRedeemMsg('Marked as paid.')
		} catch { setRedeemMsg('Failed to mark paid') }
	}
	async function cancelPayment(id: string) {
		setRedeemMsg('')
		try {
			const r = await fetch(`/api/admin/redeem/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}) }, body: JSON.stringify({ action: 'cancel' }) })
			const j = await r.json().catch(() => ({}))
			if (!r.ok) { setRedeemMsg(String(j?.error || 'Failed to cancel')); return }
			setRedeemItems(prev => prev.map(it => it.id === id ? { ...it, status: 'CANCELED', updatedAt: new Date().toISOString() } : it))
			setRedeemMsg('Marked as canceled.')
		} catch { setRedeemMsg('Failed to cancel') }
	}
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
			setAddMsg('Failed to add puzzle.')
		}
	}
	async function setActive(id: string) {
		const r = await fetch('/api/config/active', {
			method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
		})
		if (r.ok) {
			const j = await r.json()
			setItems(items.map(i => ({ ...i, active: i.id === j.id })))
			setPuzzlesMsg('Active puzzle updated successfully!')
		} else {
			setPuzzlesMsg('Failed to set active.')
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
			setPuzzlesMsg('Puzzle updated successfully!')
		} else {
			setPuzzlesMsg('Failed to update puzzle.')
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
			setPuzzlesMsg('Puzzle deleted successfully!')
		} else {
			setPuzzlesMsg('Failed to delete puzzle.')
		}
	}
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

	// --- Filtered Puzzles List ---
	const filteredItems = useMemo(() => {
		if (!puzzleSearch) return items.sort((a, b) => (b.active === a.active ? 0 : b.active ? 1 : -1)); // Active first
		const lowerSearch = puzzleSearch.toLowerCase();
		return items.filter(item =>
			item.name?.toLowerCase().includes(lowerSearch) ||
			item.address.toLowerCase().includes(lowerSearch) ||
			item.startHex.toLowerCase().includes(lowerSearch) ||
			item.endHex.toLowerCase().includes(lowerSearch)
		).sort((a, b) => (b.active === a.active ? 0 : b.active ? 1 : -1)); // Active first
	}, [items, puzzleSearch]);

	const totalPages = Math.ceil(blocksTotal / 50)

	return (
		<RouteGuard fallback={<div className="min-h-screen flex items-center justify-center"><div className="loading-overlay">
			<div className="loading-box">
				<div className="spinner" />
				<span className="loading-text">Redirecting…</span>
			</div>
		</div></div>}>
			<div className="min-h-screen bg-gray-50">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

					{/* Header Padronizado */}
					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 border-b border-gray-200 pb-4">
						<div className="flex items-center gap-3">
							<div className="p-3 bg-blue-100 rounded-xl">
								<Settings className="h-7 w-7 text-blue-600" />
							</div>
							<div>
								<h1 className="text-3xl font-bold text-gray-900">System Configuration</h1>
								<div className="text-sm text-gray-600 mt-0.5">Manage Puzzles, Pool Blocks, and Admin Settings.</div>
							</div>
						</div>
						<Badge className={`mt-3 sm:mt-0 font-semibold text-base px-3 py-1 ${sharedApiEnabled ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}>
							{sharedApiEnabled ? 'Shared API: Enabled' : 'Shared API: Disabled'}
						</Badge>
					</div>

					<Tabs defaultValue="puzzles" className="w-full">
						<TabsList className="w-full h-auto p-1 mb-6 bg-white shadow-md border border-gray-200 inline-flex gap-1 overflow-x-auto md:grid md:grid-cols-5 md:overflow-visible">
							<TabsTrigger value="puzzles" className="text-sm py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg">
								<Key className="h-4 w-4 mr-2" /> Puzzles
							</TabsTrigger>
							<TabsTrigger value="blocks" className="text-sm py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg">
								<List className="h-4 w-4 mr-2" /> Blocks
							</TabsTrigger>
							<TabsTrigger value="redeem" className="text-sm py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg">
								<Coins className="h-4 w-4 mr-2" /> Redemptions
							</TabsTrigger>
							<TabsTrigger value="settings" className="text-sm py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg">
								<Database className="h-4 w-4 mr-2" /> Admin Tools
							</TabsTrigger>
							<TabsTrigger value="user-gpus" className="text-sm py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg">
								<Cpu className="h-4 w-4 mr-2" /> User GPUs
							</TabsTrigger>
						</TabsList>

						{/* --- Puzzles Tab --- */}
						<TabsContent value="puzzles" className="space-y-6">

							{/* Active Puzzle (Consolidado) - REDESIGNED SECTION */}
							{useMemo(() => {
								const active = items.find(i => i.active);
								if (!active) return null;
								const bitRange = bitRangeLabel(active.startHex, active.endHex).replace('Key Range (Bits): ', '');

								return (
									<Card className="bg-blue-50 border-blue-400 shadow-xl overflow-hidden">
										<div className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between">
											<div className='flex flex-col gap-1'>
												<CardTitle className="text-gray-900 flex items-center gap-2 text-xl font-bold">
													<Key className="h-6 w-6 text-blue-600" /> Active Puzzle
												</CardTitle>
												<CardDescription className="text-blue-700 text-sm">This is the current priority for all workers.</CardDescription>
											</div>
											<div className="mt-3 sm:mt-0 flex items-center gap-2 shrink-0">
												<Badge className="bg-blue-600 text-white font-semibold text-sm">ACTIVE</Badge>
												{active.solved ? (
													<Badge className="inline-flex items-center gap-1 bg-green-600 text-white border border-green-700 text-sm"><CheckCircle className="h-4 w-4" />SOLVED</Badge>
												) : (
													<Badge className="inline-flex items-center gap-1 bg-yellow-500 text-white border border-yellow-600 text-sm"><XCircle className="h-4 w-4" />UNSOLVED</Badge>
												)}
											</div>
										</div>
										<div className='bg-white p-4 sm:p-6 border-t border-blue-200 grid grid-cols-1 md:grid-cols-3 gap-4'>
											<div className="flex flex-col">
												<span className="text-xs font-medium text-gray-500 uppercase">Name</span>
												<span className="text-lg font-semibold text-gray-900">{active.name || 'Unnamed Puzzle'}</span>
											</div>
											<div className="flex flex-col">
												<span className="text-xs font-medium text-gray-500 uppercase">Address</span>
												<code className="text-sm font-mono text-blue-600 break-all">{active.address}</code>
											</div>
											<div className="flex flex-col">
												<span className="text-xs font-medium text-gray-500 uppercase">Key Range</span>
												<span className="text-base font-semibold text-gray-800">{bitRange}</span>
											</div>
											<div className='md:col-span-3 space-y-2 pt-2'>
												<div className="text-xs text-gray-600 font-mono flex items-center justify-between">
													<span className="font-semibold text-gray-500">Start:</span>
													<code className='break-all text-gray-800 text-[10px] sm:text-xs pl-2'>{active.startHex}</code>
												</div>
												<div className="text-xs text-gray-600 font-mono flex items-center justify-between">
													<span className="font-semibold text-gray-500">End:</span>
													<code className='break-all text-gray-800 text-[10px] sm:text-xs pl-2'>{active.endHex}</code>
												</div>
											</div>
											{active.privateKey && (
												<div className="md:col-span-3 mt-4 p-3 bg-green-100 border border-green-400 rounded-lg flex items-center justify-between">
													<div className="flex flex-col gap-1 flex-1 pr-3">
														<h4 className="text-green-800 font-semibold text-sm flex items-center gap-2"><CheckCircle2 className='w-4 h-4' /> Solution Found:</h4>
														<code className="text-green-900 font-mono text-xs break-all">{active.privateKey}</code>
													</div>
													<Button
														type="button"
														variant="default"
														size="sm"
														className="text-white bg-green-600 hover:bg-green-700 shrink-0 h-8"
														onClick={async () => { try { await navigator.clipboard.writeText(active.privateKey || ''); setCopiedActive(true); setTimeout(() => setCopiedActive(false), 1500); } catch { } }}
													>
														{copiedActive ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
														{copiedActive ? 'Copied' : 'Copy Key'}
													</Button>
												</div>
											)}
										</div>
									</Card>
								)
							}, [items, copiedActive])}


							{/* Add New Puzzle - REDESIGNED SECTION */}
							<Card className="bg-white border-gray-200 shadow-md">
								<CardHeader className='border-b pb-4'>
									<CardTitle className="text-gray-900 flex items-center gap-2 text-xl"><Hash className="h-6 w-6 text-blue-600" />Add New Puzzle</CardTitle>
									<CardDescription className="text-gray-600">Create a puzzle by setting its address and key range in hex. The smallest range is the most efficient.</CardDescription>
								</CardHeader>
								<CardContent className='pt-6'>
									<form onSubmit={addPuzzle} className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div className="md:col-span-2">
											<Label htmlFor="add-name">Name (optional)</Label>
											<Input id="add-name" placeholder="Name" value={name} onChange={e => setName(e.target.value)} className="bg-gray-50 border-gray-300 mt-1" />
										</div>
										<div className="md:col-span-2">
											<Label htmlFor="add-address">Puzzle Address</Label>
											<Input id="add-address" placeholder="Puzzle Address" value={address} onChange={e => setAddress(e.target.value)} className="bg-gray-50 border-gray-300 mt-1" />
										</div>
										<div>
											<Label htmlFor="add-start">Start Range (hex)</Label>
											<Input id="add-start" placeholder="Start Range (hex)" value={startHex} onChange={e => setStartHex(e.target.value)} className="bg-gray-50 border-gray-300 mt-1" />
										</div>
										<div>
											<Label htmlFor="add-end">End Range (hex)</Label>
											<Input id="add-end" placeholder="End Range (hex)" value={endHex} onChange={e => setEndHex(e.target.value)} className="bg-gray-50 border-gray-300 mt-1" />
										</div>
										<div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2">
											<div className="flex items-center space-x-2 shrink-0">
												<Checkbox id="add-solved" checked={solved} onCheckedChange={(checked) => setSolved(!!checked)} />
												<label htmlFor="add-solved" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
													Mark as Solved
												</label>
											</div>
											<div className="flex-1 w-full sm:w-auto">
												<Button type="submit" disabled={!addValid} className={`w-full ${addValid ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-400 text-white cursor-not-allowed'}`}>
													Add Puzzle
												</Button>
											</div>
											{(!addValid && addError) && <span className="text-sm text-red-600 font-medium mt-1 sm:mt-0 sm:ml-4">{addError}</span>}
											{addMsg && <span className={`text-sm font-medium mt-1 sm:mt-0 sm:ml-4 ${addMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{addMsg}</span>}
										</div>
									</form>
								</CardContent>
							</Card>

							{/* Puzzle List & Management - REDESIGNED SECTION */}
							<Card className="bg-white border-gray-200 shadow-md">
								<CardHeader className='border-b pb-4'>
									<CardTitle className="text-gray-900 flex items-center gap-2 text-xl"><Key className="h-6 w-6 text-blue-600" />All Puzzles ({items.length})</CardTitle>
									<CardDescription className="text-gray-600">Manage existing puzzles: set active, edit details, or delete entries.</CardDescription>
								</CardHeader>
								<CardContent className='pt-6'>
									{/* Search/Filter Bar */}
									<div className="flex items-center space-x-2 mb-6">
										<Search className="h-4 w-4 text-gray-500 shrink-0" />
										<Input
											placeholder="Search by name, address, or hex range..."
											value={puzzleSearch}
											onChange={e => setPuzzleSearch(e.target.value)}
											className="bg-white border-gray-300"
										/>
										<Button variant="outline" size="icon" title="Clear Search" onClick={() => setPuzzleSearch('')} className="shrink-0">
											<Filter className="h-4 w-4" />
										</Button>
									</div>
									{puzzlesMsg && <div className="mb-4 text-sm text-gray-700 font-medium">{puzzlesMsg}</div>}

									{/* Responsive List View */}
									<div className="space-y-4">
										{filteredItems.length === 0 && (
											<div className="text-center py-6 text-gray-600 border border-gray-200 rounded-lg bg-gray-50">
												{items.length === 0 ? 'No puzzles added yet. Start by adding one above.' : 'No puzzles matched your search criteria.'}
											</div>
										)}

										{filteredItems.map(i => (
											<Card key={i.id} className={`bg-gray-50 transition-all ${i.active ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-blue-300'}`}>
												<CardContent className='p-4'>
													<div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
														{/* Left Section (Key Details) */}
														<div className="flex flex-col gap-1 flex-1 min-w-0">
															<div className="flex items-center flex-wrap gap-2">
																{i.active && <Badge className="bg-blue-600 text-white font-bold text-xs shrink-0">ACTIVE</Badge>}
																{i.solved ? (
																	<Badge className="inline-flex items-center gap-1 bg-green-600 text-white text-xs shrink-0"><CheckCircle className="h-3 w-3" />Solved</Badge>
																) : (
																	<Badge className="inline-flex items-center gap-1 bg-yellow-500 text-white text-xs shrink-0"><XCircle className="h-3 w-3" />Unsolved</Badge>
																)}
																<span className="font-semibold text-gray-900 text-base break-all flex-1 min-w-0">
																	{i.name || `Address: ${formatAddress(i.address)}`}
																</span>
															</div>
															<div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 mt-1'>
																<code className='font-medium text-blue-600 font-mono'>{i.address}</code>
																<span className="text-gray-500 ml-auto lg:ml-0">
																	<span className="font-medium text-gray-700">{bitRangeLabel(i.startHex, i.endHex)}</span>
																</span>
																<div className="flex items-center gap-2 mt-1 text-xs text-gray-700">
																	<span className="text-gray-600">Start:</span>
																	<code className="font-mono text-gray-800 break-all">{formatCompactHexRange(i.startHex)}</code>
																	<span className="text-gray-400">→</span>
																	<span className="text-gray-600">End:</span>
																	<code className="font-mono text-gray-800 break-all">{formatCompactHexRange(i.endHex)}</code>
																</div>
															</div>
														</div>

														{/* Right Section (Actions) */}
														{editingId === i.id ? (
															<div className="flex items-center gap-2 mt-2 lg:mt-0 shrink-0">
																<Button onClick={() => saveEdit(i.id)} disabled={!editValid} className="h-8 text-xs px-3 bg-green-600 text-white hover:bg-green-700">Save</Button>
																<Button onClick={cancelEdit} variant="outline" className="h-8 text-xs px-3">Cancel</Button>
															</div>
														) : (
															<div className="flex items-center gap-2 mt-2 lg:mt-0 shrink-0">
																{!i.active && (
																	<Button onClick={() => setActive(i.id)} className="bg-blue-600 text-white hover:bg-blue-700 h-8 text-xs px-3">Set Active</Button>
																)}
																<Button onClick={() => startEdit(i)} variant="outline" size="icon" title="Edit" className="h-8 w-8">
																	<Edit3 className="h-4 w-4 text-blue-600" />
																</Button>
																<Button onClick={() => deleteItem(i.id)} variant="destructive" size="icon" title="Delete" className="h-8 w-8 bg-red-600 hover:bg-red-700">
																	<Trash2 className="h-4 w-4" />
																</Button>
															</div>
														)}
													</div>

													{/* Full Edit Form (Expands below on edit) */}
													{editingId === i.id && (
														<div className="mt-4 p-4 bg-white border border-gray-300 rounded-lg shadow-inner">
															<h4 className='text-md font-semibold text-gray-900 mb-4 border-b pb-2'>Edit Puzzle Details</h4>
															<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
																<Input placeholder="Name (optional)" value={editName} onChange={e => setEditName(e.target.value)} className="bg-gray-50 border-gray-300" />
																<Input placeholder="Puzzle Address" value={editAddress} onChange={e => setEditAddress(e.target.value)} className="bg-gray-50 border-gray-300" />
																<Input placeholder="Start Range (hex)" value={editStartHex} onChange={e => setEditStartHex(e.target.value)} className="bg-gray-50 border-gray-300" />
																<Input placeholder="End Range (hex)" value={editEndHex} onChange={e => setEditEndHex(e.target.value)} className="bg-gray-50 border-gray-300" />
																<div className="md:col-span-2 flex items-center space-x-2">
																	<Checkbox id={`edit-solved-${i.id}`} checked={editSolved} onCheckedChange={(checked) => setEditSolved(!!checked)} />
																	<label htmlFor={`edit-solved-${i.id}`} className="text-sm font-medium leading-none">Puzzle solved</label>
																</div>
																<div className="md:col-span-2 flex items-center gap-2 mt-2">
																	<Button onClick={() => saveEdit(i.id)} disabled={!editValid} className={!editValid ? 'bg-gray-400 text-white' : 'bg-green-600 text-white hover:bg-green-700'}>
																		<CheckCircle2 className="h-4 w-4 mr-2" /> Save Changes
																	</Button>
																	<Button onClick={cancelEdit} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100">Cancel</Button>
																</div>
															</div>
														</div>
													)}
													{/* Solved Key Display (View Mode) */}
													{editingId !== i.id && i.privateKey && (
														<div className="mt-3 p-2 bg-green-50 border border-green-300 rounded-lg flex items-center justify-between">
															<code className="text-green-800 font-mono text-xs break-all flex-1 pr-3">Solution: {i.privateKey}</code>
															<Button
																type="button"
																variant="outline"
																size="sm"
																className="text-green-700 hover:text-green-900 border-green-300 bg-white ml-2 shrink-0 h-8 text-xs"
																onClick={async () => { try { await navigator.clipboard.writeText(i.privateKey || ''); setCopiedId(i.id); setTimeout(() => setCopiedId(null), 1500); } catch { } }}
															>
																{copiedId === i.id ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
															</Button>
														</div>
													)}
												</CardContent>
											</Card>
										))}
									</div>
								</CardContent>
							</Card>
						</TabsContent>

						{/* --- Blocks Tab (Grid View) --- */}
						<TabsContent value="blocks" className="space-y-6">
							<Card className="bg-white border-gray-200 shadow-md">
								<CardHeader className='border-b pb-4'>
									<CardTitle className="text-gray-900 flex items-center gap-2 text-xl"><List className="h-6 w-6 text-blue-600" />Recent Completed Blocks</CardTitle>
									<CardDescription className="text-gray-600">Last 50 completed blocks per page, displayed in a responsive card grid for easy reading.</CardDescription>
								</CardHeader>
								<CardContent className='pt-6'>
									<div className="flex items-center justify-end gap-2 mb-4">
										<Button
											variant="outline"
											disabled={blocksLoading}
											onClick={() => fetchBlocks(blocksPage)}
										>
											{blocksLoading ? <RotateCw className="h-4 w-4 animate-spin mr-2" /> : <RotateCw className="h-4 w-4 mr-2" />}
											Refresh
										</Button>
									</div>

									<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
										{blocksLoading ? (
											Array.from({ length: 6 }).map((_, i) => (
												<BlockCardSkeleton key={`sk-block-${i}`} />
											))
										) : blocks.length === 0 ? (
											<div className="col-span-full text-center py-6 text-gray-600 border border-gray-200 rounded-lg bg-gray-50">No completed blocks data available.</div>
										) : (
											blocks.map(b => <BlockCard key={b.id} block={b} />)
										)}
									</div>

									{/* Pagination Controls */}
									<div className="flex items-center justify-between mt-6">
										<div className="text-sm text-gray-600">
											Showing {blocks.length} blocks. Total: {blocksTotal}
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												disabled={blocksPage <= 1 || blocksLoading}
												onClick={() => fetchBlocks(blocksPage - 1)}
											>
												<ChevronLeft className="h-4 w-4" />
											</Button>
											<div className="text-sm font-medium text-gray-700">Page {blocksPage} of {totalPages}</div>
											<Button
												variant="outline"
												size="sm"
												disabled={blocksPage >= totalPages || blocksLoading}
												onClick={() => fetchBlocks(blocksPage + 1)}
											>
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						</TabsContent>

						{/* --- Redemptions Tab (Table View) --- */}
						<TabsContent value="redeem" className="space-y-6">
							<Card className="bg-white border-gray-200 shadow-md">
								<CardHeader className='border-b pb-4'>
									<CardTitle className="text-gray-900 flex items-center gap-2 text-xl"><Coins className="h-6 w-6 text-purple-600" />Redemption Requests</CardTitle>
									<CardDescription className="text-gray-600">Review user reward redemption requests and approve or deny them.</CardDescription>
								</CardHeader>
								<CardContent className='pt-6'>
									{/* Filters and Refresh */}
									<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
										<div className="text-sm text-gray-700 font-medium shrink-0">{redeemLoading ? 'Loading requests…' : `${redeemItems.length} request(s) found`}</div>
										<div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
											<select value={redeemStatusFilter} onChange={e => setRedeemStatusFilter(e.target.value)} className="border border-gray-300 rounded px-3 py-1.5 text-sm h-9 bg-white">
												<option value="">Status: All</option>
												<option value="PENDING">Pending</option>
												<option value="APPROVED">Approved</option>
												<option value="PAID">Paid</option>
												<option value="DENIED">Denied</option>
												<option value="CANCELED">Canceled</option>
											</select>
											<Input placeholder="Filter by puzzle address" value={redeemPuzzleFilter} onChange={e => setRedeemPuzzleFilter(e.target.value)} className="bg-white border-gray-300 h-9 text-sm flex-1 sm:flex-none sm:w-48" />
											<Button variant="outline" onClick={fetchRedeems} disabled={redeemLoading} className="h-9 shrink-0">
												{redeemLoading ? <RotateCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
											</Button>
										</div>
									</div>
									{redeemMsg && <div className={`text-sm mb-4 font-medium ${redeemMsg.includes('success') || redeemMsg.includes('approved') || redeemMsg.includes('paid') ? 'text-green-600' : 'text-red-600'}`}>{redeemMsg}</div>}

									<div className="overflow-x-auto rounded-lg border border-gray-200">
										<Table className="min-w-full divide-y divide-gray-200">
											<TableHeader className="bg-gray-50">
												<TableRow>
													<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">ID (User Token)</TableHead>
													<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Recipient Address</TableHead>
													<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Puzzle</TableHead>
													<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600 text-right">Amount</TableHead>
													<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600 text-right">Est. BTC</TableHead>
													<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Status</TableHead>
													<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Requested</TableHead>
													<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Share %</TableHead>
													<TableHead className="py-3 px-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody className='divide-y divide-gray-200'>
												{redeemItems.map(it => (
													<TableRow key={it.id} className="hover:bg-blue-50/50 text-xs">
														<TableCell className="py-3 px-3 font-mono break-all text-gray-800">{formatAddress(it.userTokenId)}</TableCell>
														<TableCell className="py-3 px-3 font-mono break-all text-blue-600">{formatBitcoinAddress(it.address)}</TableCell>
														<TableCell className="py-3 px-3 font-mono break-all text-gray-600">{it.puzzleAddress ? formatBitcoinAddress(it.puzzleAddress) : '-'}</TableCell>
														<TableCell className="py-3 px-3 font-bold text-gray-900 text-right">{it.amount.toFixed(3)}</TableCell>
														<TableCell className="py-3 px-3 font-medium text-right text-gray-800">{Number(it.estimatedBtc || 0).toFixed(8)}</TableCell>
														<TableCell className="py-3 px-3">
															{/* Enhanced Badges */}
															{it.status === 'PAID' ? <Badge className="bg-green-600 text-white">Paid</Badge> :
																it.status === 'APPROVED' ? <Badge className="bg-blue-600 text-white">Approved</Badge> :
																	it.status === 'DENIED' ? <Badge className="bg-red-500 text-white">Denied</Badge> :
																		it.status === 'CANCELED' ? <Badge className="bg-gray-400 text-white">Canceled</Badge> :
																			<Badge className="bg-yellow-500 text-white">Pending</Badge>}
														</TableCell>
														<TableCell className="py-3 px-3 text-gray-600">{it.createdAt ? timeAgo(it.createdAt) : '-'}</TableCell>
														<TableCell className="py-3 px-3 font-medium text-gray-800">{(it.sharePercent || 0).toFixed(2)}%</TableCell>
														<TableCell className="py-3 px-3 text-right">
															{/* --- REDESIGNED ACTION MENU USING DropdownMenu --- */}
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="outline" size="icon" aria-label="Actions" className="h-8 w-8">
																		<MoreHorizontal className="h-4 w-4 text-gray-700" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end" className="w-44 shadow-xl">

																	<DropdownMenuItem
																		className="flex items-center gap-2 text-sm text-green-700 font-medium"
																		onSelect={() => approveRedeem(it.id)}
																		disabled={it.status !== 'PENDING'}
																	>
																		<CheckCircle2 className="h-4 w-4" /> Approve
																	</DropdownMenuItem>

																	<DropdownMenuItem
																		className="flex items-center gap-2 text-sm text-red-700 font-medium"
																		onSelect={() => denyRedeem(it.id)}
																		disabled={it.status !== 'PENDING'}
																	>
																		<XCircle className="h-4 w-4" /> Deny
																	</DropdownMenuItem>

																	<DropdownMenuSeparator />

																	<DropdownMenuItem
																		className="flex items-center gap-2 text-sm text-blue-700 font-medium"
																		onSelect={() => markPaid(it.id)}
																		disabled={it.status !== 'APPROVED'}
																	>
																		<CheckCircle className="h-4 w-4" /> Mark Paid
																	</DropdownMenuItem>

																	<DropdownMenuItem
																		className="flex items-center gap-2 text-sm text-gray-700 font-medium"
																		onSelect={() => cancelPayment(it.id)}
																		disabled={it.status !== 'APPROVED'}
																	>
																		<XCircle className="h-4 w-4" /> Cancel
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												))}
												{redeemItems.length === 0 && !redeemLoading && (
													<TableRow><TableCell className="py-4 px-3 text-gray-600 text-center" colSpan={9}>No redemption requests found for the current filters.</TableCell></TableRow>
												)}
											</TableBody>
										</Table>
									</div>
								</CardContent>
							</Card>
						</TabsContent>

						{/* --- Admin Tools Tab (Settings) --- */}
						<TabsContent value="settings" className="space-y-6">

							{/* Database Backup & Restore - REDESIGNED SECTION */}
							<Card className="bg-white border-gray-200 shadow-md">
								<CardHeader className='border-b pb-4'>
									<CardTitle className="text-gray-900 flex items-center gap-2 text-xl"><Database className="h-6 w-6 text-blue-600" />Database Management</CardTitle>
									<CardDescription className="text-gray-600">Safely export the database for backup, or restore from a previously saved file.</CardDescription>
								</CardHeader>
								<CardContent className='pt-6 space-y-6'>
									{/* Backup */}
									<div className='pb-4 border-b border-gray-100'>
										<h3 className='text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2'><Download className="h-5 w-5 text-blue-500" /> Backup Database</h3>
										<p className='text-sm text-gray-600 mb-3'>Download the current database file to your local machine for safekeeping.</p>
										<Button
											type="button"
											className="bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2 w-full sm:w-auto"
											onClick={async () => {
												try {
													const r = await fetch('/api/config/backup', { headers: setupSecret ? { 'x-setup-secret': setupSecret } : undefined })
													if (!r.ok) return
													const blob = await r.blob()
													const url = URL.createObjectURL(blob)
													const a = document.createElement('a')
													a.href = url
													const now = new Date()
													const pad = (n: number) => n.toString().padStart(2, '0')
													const fname = `dev-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.db`
													a.download = fname
													document.body.appendChild(a)
													a.click()
													a.remove()
													URL.revokeObjectURL(url)
												} catch { }
											}}
										>
											<Download className="h-4 w-4" /> Download Backup
										</Button>
									</div>
									{/* Restore */}
									<div>
										<h3 className='text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2'><Upload className="h-5 w-5 text-green-600" /> Restore Database (CAUTION)</h3>
										<p className='text-sm text-red-600 font-medium mb-3'>**Warning:** Restoring a backup will **overwrite** all current data.</p>
										<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
											<Input
												type="file"
												accept=".db,application/octet-stream"
												onChange={e => setRestoreFile(e.target.files?.[0] || null)}
												className="bg-gray-50 border-gray-300 flex-1"
											/>
											<Button
												type="button"
												disabled={!restoreFile || restoring}
												className={`inline-flex items-center gap-2 w-full sm:w-auto ${!restoreFile || restoring ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
												onClick={async () => {
													if (!restoreFile) return
													setRestoring(true)
													setRestoreMsg('')
													try {
														const fd = new FormData()
														fd.append('file', restoreFile)
														const r = await fetch('/api/config/backup', { method: 'POST', body: fd, headers: setupSecret ? { 'x-setup-secret': setupSecret } : undefined })
														if (r.ok) {
															setRestoreMsg('Database restored successfully! Reloading data...')
															setTimeout(() => window.location.reload(), 1500);
														} else { setRestoreMsg('Restore failed') }
													} catch { setRestoreMsg('Restore failed') }
													finally { setRestoring(false); setRestoreFile(null) }
												}}
											>
												{restoring ? <RotateCw className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />} {restoring ? 'Restoring...' : 'Restore Backup'}
											</Button>
										</div>
										{restoreMsg && <div className={`text-sm mt-3 font-medium ${restoreMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{restoreMsg}</div>}
									</div>
									<div className='pt-4 border-t border-gray-100'>
										<h3 className='text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2'><RotateCw className="h-5 w-5 text-gray-600" /> Database Status</h3>
										<div className='flex flex-col sm:flex-row gap-3 sm:items-center'>
											<Button type="button" className={`inline-flex items-center gap-2 ${dbStatusLoading ? 'bg-gray-400 text-white' : 'bg-gray-700 text-white hover:bg-gray-800'} w-full sm:w-auto`} disabled={dbStatusLoading} onClick={checkDbStatus}>
												{dbStatusLoading ? <RotateCw className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />} Check DB Status
											</Button>
											{dbStatus && (
												<div className='flex-1 grid grid-cols-1 md:grid-cols-2 gap-3'>
													{dbStatus.pathMismatch && (
														<div className='md:col-span-2 p-3 bg-red-50 border border-red-300 rounded'>
															<div className='text-xs text-red-700 font-semibold mb-1'>Warning: DATABASE_URL points outside prisma/</div>
															<div className='text-xs text-red-700'>Current: <code className='text-[11px]'>{dbStatus.envUrl || '-'}</code></div>
															<div className='text-xs text-red-700'>Suggested: <code className='text-[11px]'>{dbStatus.suggestedEnvUrl || 'file:./prisma/dev.db'}</code></div>
															<div className='text-xs text-red-700 mt-1'>Update your environment variable and restart the app.</div>
														</div>
													)}
													<div className='p-3 bg-gray-50 border border-gray-200 rounded'>
														<div className='text-xs text-gray-600'>Database URL</div>
														<code className='text-xs text-gray-800 break-all'>{dbStatus.envUrl || '-'}</code>
													</div>
													<div className='p-3 bg-gray-50 border border-gray-200 rounded'>
														<div className='text-xs text-gray-600'>Database File</div>
														<code className='text-xs text-gray-800 break-all'>{dbStatus.dbFile || '-'}</code>
													</div>
													<div className='p-3 bg-gray-50 border border-gray-200 rounded'>
														<div className='text-xs text-gray-600'>Tables</div>
														<span className='text-sm font-semibold text-gray-900'>{dbStatus.tables}</span>
													</div>
													<div className='p-3 bg-gray-50 border border-gray-200 rounded'>
														<div className='text-xs text-gray-600'>File Size</div>
														<span className='text-sm font-semibold text-gray-900'>{dbStatus.sizeBytes ? `${(dbStatus.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : '-'}</span>
													</div>
													<div className='md:col-span-2 p-3 bg-gray-50 border border-gray-200 rounded'>
														<div className='text-xs text-gray-600 mb-1'>Table Names</div>
														<code className='text-xs text-gray-800 wrap-break-word'>{dbStatus.tableNames && dbStatus.tableNames.length ? dbStatus.tableNames.join(', ') : '-'}</code>
													</div>
												</div>
											)}
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Shared Pool API Settings - REDESIGNED SECTION */}
							<Card className="bg-white border-gray-200 shadow-md">
								<CardHeader className='border-b pb-4'>
									<CardTitle className="text-gray-900 flex items-center gap-2 text-xl"><Shield className="h-6 w-6 text-purple-600" />Shared Pool API Settings</CardTitle>
									<CardDescription className="text-gray-600">Control the accessibility of the shared pool API for external integrations.</CardDescription>
								</CardHeader>
								<CardContent className='pt-6 space-y-4'>
									<div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
										<div className="flex items-center gap-3 flex-1">
											<input
												id="shared-api-toggle"
												type="checkbox"
												checked={sharedApiEnabled}
												onChange={(e) => toggleSharedApi(e.target.checked)}
												className="h-5 w-5 rounded accent-blue-600 focus:ring-blue-500 shrink-0"
											/>
											<div className="space-y-0.5">
												<Label htmlFor="shared-api-toggle" className="text-sm font-semibold text-gray-800 cursor-pointer">Enable Shared Pool API</Label>
												<p className="text-xs text-gray-600">Allows other clients to query block validation status and submit solutions.</p>
											</div>
										</div>
										<Badge
											className={`font-bold text-sm px-3 py-1.5 shrink-0 ${sharedApiEnabled ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}
										>
											{sharedApiEnabled ? 'Enabled' : 'Disabled'}
										</Badge>
									</div>

									<div className='pt-2 flex items-center gap-3'>
										<Button
											variant="outline"
											className='text-blue-600 border-blue-200 hover:bg-blue-50'
											onClick={async () => {
												try {
													const r = await fetch('/api/config', { headers: setupSecret ? { 'x-setup-secret': setupSecret } : undefined })
													if (r.ok) {
														const j = await r.json();
														setItems(Array.isArray(j) ? j : [])
														setSharedMsg('Puzzles refreshed from database.')
													}
												} catch { setSharedMsg('Failed to refresh puzzles.') }
											}}
										>
											<RotateCw className='w-4 h-4 mr-2' /> Refresh Puzzles Data
										</Button>
										{sharedMsg && <span className="text-sm text-gray-600">{sharedMsg}</span>}
									</div>
								</CardContent>
							</Card>
						</TabsContent>

						{/* --- User GPUs Tab --- */}
						<TabsContent value="user-gpus" className="space-y-6">
							<Card className="bg-white border-gray-200 shadow-md">
								<CardHeader className='border-b pb-4'>
									<CardTitle className="text-gray-900 flex items-center gap-2 text-xl"><Cpu className="h-6 w-6 text-blue-600" />User GPU Submissions</CardTitle>
									<CardDescription className="text-gray-600">Approve or deny user-submitted GPU performance entries.</CardDescription>
								</CardHeader>
								<CardContent className='pt-6'>
									<div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
										<div className="text-sm text-gray-700 font-medium">{userGpuLoading ? 'Loading…' : `${userGpuItems.length} submission(s)`}</div>
										<div className="flex items-center gap-2">
											<Button variant="outline" onClick={fetchUserGpusAdmin} disabled={userGpuLoading}><RotateCw className="h-4 w-4 mr-2" /> Refresh</Button>
										</div>
									</div>
									{userGpuMsg && <div className={`text-sm mb-4 font-medium ${userGpuMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{userGpuMsg}</div>}
									<Tabs defaultValue="approved" className="w-full">
										<TabsList className="w-full h-auto p-1 mb-4 bg-white shadow-sm border border-gray-200 inline-flex gap-1">
											<TabsTrigger value="approved" className="text-xs py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white">Approved ({approvedGpuItems.length})</TabsTrigger>
											<TabsTrigger value="pending" className="text-xs py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white">Pending ({pendingGpuItems.length})</TabsTrigger>
										</TabsList>
										<TabsContent value="approved">
											<div className="overflow-x-auto rounded-lg border border-gray-200">
												<Table className="min-w-full divide-y divide-gray-200">
													<TableHeader className="bg-gray-50">
														<TableRow>
															<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Model</TableHead>
															<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600 text-right">Speed</TableHead>
															<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Status</TableHead>
															<TableHead className="py-3 px-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody className='divide-y divide-gray-200'>
														{approvedGpuItems.map(it => (
															<TableRow key={it.id} className="hover:bg-blue-50/50 text-xs">
																<TableCell className="py-3 px-3 font-medium text-gray-900">{it.model}</TableCell>
																<TableCell className="py-3 px-3 break-all text-right"><SpeedCell m={Number(it.approx_keys_per_second_mkeys)} /></TableCell>
																<TableCell className="py-3 px-3">
																	<Badge className="bg-green-600 text-white">Approved</Badge>
																</TableCell>
																<TableCell className="py-3 px-3 text-right">
																	<div className="flex items-center justify-end gap-2">
																		<Button variant="outline" size="sm" disabled>
																			<CheckCircle2 className="h-4 w-4 mr-1" /> Approve
																		</Button>
																		<Button variant="destructive" size="sm" disabled>
																			<XCircle className="h-4 w-4 mr-1" /> Deny
																		</Button>
																		<Button variant="outline" size="sm" onClick={async () => { setUserGpuMsg(''); const ok = typeof window !== 'undefined' ? window.confirm('Remove this submission?') : true; if (!ok) return; try { const r = await fetch(`/api/user-gpus/${encodeURIComponent(it.id)}`, { method: 'DELETE', headers: { ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}) } }); const j = await r.json().catch(() => ({})); if (!r.ok) { setUserGpuMsg(String(j?.error || 'Failed to remove')); return } setUserGpuItems(prev => prev.filter(x => x.id !== it.id)); setUserGpuMsg('Submission removed'); } catch { setUserGpuMsg('Failed to remove') } }}>
																			<Trash2 className="h-4 w-4 mr-1" /> Remove
																		</Button>
																	</div>
																</TableCell>
															</TableRow>
														))}
														{approvedGpuItems.length === 0 && !userGpuLoading && (
															<TableRow><TableCell className="py-4 px-3 text-gray-600 text-center" colSpan={4}>No approved submissions.</TableCell></TableRow>
														)}
													</TableBody>
												</Table>
											</div>
										</TabsContent>
										<TabsContent value="pending">
											<div className="overflow-x-auto rounded-lg border border-gray-200">
												<Table className="min-w-full divide-y divide-gray-200">
													<TableHeader className="bg-gray-50">
														<TableRow>
															<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Model</TableHead>
															<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600 text-right">Speed</TableHead>
															<TableHead className="py-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-600">Status</TableHead>
															<TableHead className="py-3 px-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody className='divide-y divide-gray-200'>
														{pendingGpuItems.map(it => (
															<TableRow key={it.id} className="hover:bg-blue-50/50 text-xs">
																<TableCell className="py-3 px-3 font-medium text-gray-900">{it.model}</TableCell>
																<TableCell className="py-3 px-3 break-all text-right"><SpeedCell m={Number(it.approx_keys_per_second_mkeys)} /></TableCell>
																<TableCell className="py-3 px-3">
																	<Badge className="bg-yellow-500 text-white">Pending</Badge>
																</TableCell>
																<TableCell className="py-3 px-3 text-right">
																	<div className="flex items-center justify-end gap-2">
																		<Button variant="outline" size="sm" disabled={it.status !== 'PENDING'} onClick={async () => { setUserGpuMsg(''); try { const r = await fetch(`/api/user-gpus/${encodeURIComponent(it.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}) }, body: JSON.stringify({ action: 'approve' }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setUserGpuMsg(String(j?.error || 'Failed to approve')); return } setUserGpuItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'APPROVED' } : x)); setUserGpuMsg('Submission approved successfully!'); } catch { setUserGpuMsg('Failed to approve') } }}>
																			<CheckCircle2 className="h-4 w-4 mr-1" /> Approve
																		</Button>
																		<Button variant="destructive" size="sm" disabled={it.status !== 'PENDING'} onClick={async () => { setUserGpuMsg(''); try { const r = await fetch(`/api/user-gpus/${encodeURIComponent(it.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}) }, body: JSON.stringify({ action: 'deny' }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { setUserGpuMsg(String(j?.error || 'Failed to deny')); return } setUserGpuItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'DENIED' } : x)); setUserGpuMsg('Submission denied'); } catch { setUserGpuMsg('Failed to deny') } }}>
																			<XCircle className="h-4 w-4 mr-1" /> Deny
																		</Button>
																		<Button variant="outline" size="sm" onClick={async () => { setUserGpuMsg(''); const ok = typeof window !== 'undefined' ? window.confirm('Remove this submission?') : true; if (!ok) return; try { const r = await fetch(`/api/user-gpus/${encodeURIComponent(it.id)}`, { method: 'DELETE', headers: { ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}) } }); const j = await r.json().catch(() => ({})); if (!r.ok) { setUserGpuMsg(String(j?.error || 'Failed to remove')); return } setUserGpuItems(prev => prev.filter(x => x.id !== it.id)); setUserGpuMsg('Submission removed'); } catch { setUserGpuMsg('Failed to remove') } }}>
																			<Trash2 className="h-4 w-4 mr-1" /> Remove
																		</Button>
																	</div>
																</TableCell>
															</TableRow>
														))}
														{pendingGpuItems.length === 0 && !userGpuLoading && (
															<TableRow><TableCell className="py-4 px-3 text-gray-600 text-center" colSpan={4}>No pending submissions.</TableCell></TableRow>
														)}
													</TableBody>
												</Table>
											</div>
										</TabsContent>
									</Tabs>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>

				</div>
			</div>
		</RouteGuard>
	)
}
