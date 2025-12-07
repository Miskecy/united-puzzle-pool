'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { ArrowRight, CheckCircle2, Copy, Award, AlertTriangle } from 'lucide-react'

type Stats = { token: string, bitcoinAddress: string, availableCredits: number }
type InitResponse = { message: string, nonce: string, amount: number, address: string }
type Dist = { balanceBtc: number, poolShareBtc: number, totalAvailableCredits: number, userAvailableCredits: number, userSharePercent: number, expectedRewardBtc: number }
type PendingRedeem = { id: string, amount: number, address: string, createdAt?: string }
type HistoryItem = { id: string, amount: number, status: string, createdAt?: string | null, approvedAt?: string | null, updatedAt?: string | null, paidAt?: string | null, canceledAt?: string | null, puzzleAddress?: string | null }
type SolvedPuzzle = { id: string, name?: string | null, address: string, active?: boolean }
type SolvedPuzzleMeta = SolvedPuzzle & { balanceBtc?: number, poolShareBtc?: number }

export default function RedeemRewardWizard() {
	const router = useRouter()
	const [step, setStep] = useState<number>(1)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const [stats, setStats] = useState<Stats | null>(null)

	const [initData, setInitData] = useState<InitResponse | null>(null)
	const [pending, setPending] = useState<PendingRedeem | null>(null)
	const [signature, setSignature] = useState('')
	const [copiedMsg, setCopiedMsg] = useState(false)
	const [requestId, setRequestId] = useState<string | null>(null)
	const [dist, setDist] = useState<Dist | null>(null)
	const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
	const [historyLoading, setHistoryLoading] = useState(false)
	const [solvedPuzzles, setSolvedPuzzles] = useState<SolvedPuzzleMeta[]>([])
	const [selectedPuzzleId, setSelectedPuzzleId] = useState<string>('')

	const token = useMemo(() => { try { return localStorage.getItem('pool-token') || '' } catch { return '' } }, [])

	useEffect(() => {
		let mounted = true
			; (async () => {
				try {
					const r = await fetch('/api/user/stats', { headers: { 'pool-token': token } })
					if (!r.ok) throw new Error('Failed to load stats')
					const j = await r.json()
					if (mounted) setStats({ token: j.token, bitcoinAddress: j.bitcoinAddress, availableCredits: Number(j.availableCredits || 0) })
				} catch {
					setError('Unable to fetch user stats. Ensure you have a valid token.')
				}
				try {
					const d = await fetch('/api/pool/distribution', { headers: { 'pool-token': token } })
					if (d.ok) {
						const dj: Dist = await d.json()
						if (mounted) setDist(dj)
					}
				} catch { }
				try {
					const s = await fetch('/api/redeem/status', { headers: { 'pool-token': token } })
					if (s.ok) {
						const sj = await s.json()
						if (sj && sj.status === 'PENDING') {
							if (mounted) setPending({ id: String(sj.id || ''), amount: Number(sj.amount || 0), address: String(sj.address || ''), createdAt: String(sj.createdAt || '') })
						}
					}
				} catch { }
				try {
					setHistoryLoading(true)
					const h = await fetch('/api/redeem/list', { headers: { 'pool-token': token } })
					if (h.ok) {
						const hj = await h.json()
						const arr = Array.isArray(hj.items) ? (hj.items as { id: unknown, amount: unknown, status: unknown, createdAt?: unknown, approvedAt?: unknown, updatedAt?: unknown, paidAt?: unknown, canceledAt?: unknown, puzzleAddress?: unknown }[]) : []
						if (mounted) setHistoryItems(arr.map(r => ({ id: String(r.id), amount: Number(r.amount || 0), status: String(r.status || 'PENDING'), createdAt: r.createdAt ? String(r.createdAt) : null, approvedAt: r.approvedAt ? String(r.approvedAt) : null, updatedAt: r.updatedAt ? String(r.updatedAt) : null, paidAt: r.paidAt ? String(r.paidAt) : null, canceledAt: r.canceledAt ? String(r.canceledAt) : null, puzzleAddress: r.puzzleAddress ? String(r.puzzleAddress) : null })))
					}
				} catch { }
				finally { setHistoryLoading(false) }

				try {
					const p = await fetch('/api/puzzles/solved', { cache: 'no-store' })
					if (p.ok) {
						const pj = await p.json()
						const arr = Array.isArray(pj.items) ? (pj.items as { id: unknown, name?: unknown, address: unknown, active?: unknown, balanceBtc?: unknown, poolShareBtc?: unknown }[]) : []
						const fullList = arr.map(it => ({ id: String(it.id), name: it.name ? String(it.name) : null, address: String(it.address), active: !!it.active, balanceBtc: Number(it.balanceBtc || 0), poolShareBtc: Number(it.poolShareBtc || 0) }))
						const list = fullList.filter(p => (p.balanceBtc || 0) >= 0.00001)
						if (mounted) {
							setSolvedPuzzles(list)
							if (list.length > 0) {
								const activeOne = list.find(x => x.active)
								setSelectedPuzzleId(activeOne ? activeOne.id : list[0].id)
							} else {
								setSelectedPuzzleId('')
							}
						}
					}
				} catch { }
			})()
		return () => { mounted = false }
	}, [token])

	const startInit = async () => {
		setError(null)
		if (!stats) return
		if (solvedPuzzles.length > 0 && !selectedPuzzleId) {
			setError('Select a puzzle to redeem')
			return
		}
		if (pending) {
			setError('You already have a pending redemption request. Please wait for admin review.')
			return
		}
		const max = Number(stats.availableCredits || 0)
		if (!isFinite(max) || max <= 0) {
			setError('No available credits to redeem')
			return
		}
		setLoading(true)
		try {
			const r = await fetch('/api/redeem/init', { method: 'POST', headers: { 'Content-Type': 'application/json', 'pool-token': token }, body: JSON.stringify({ puzzleId: selectedPuzzleId || undefined }) })
			const j = await r.json()
			if (!r.ok) {
				throw new Error(j?.error || 'Failed to initialize redemption')
			}
			setInitData(j)
			setStep(2)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally { setLoading(false) }
	}

	const verifyAndSubmit = async () => {
		setError(null)
		if (!initData || !signature.trim()) {
			setError('Paste the signature to continue')
			return
		}
		setLoading(true)
		try {
			const r = await fetch('/api/redeem/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'pool-token': token }, body: JSON.stringify({ nonce: initData.nonce, signature: signature.trim() }) })
			const j = await r.json()
			if (!r.ok || !j?.success) {
				throw new Error(j?.error || 'Signature verification failed')
			}
			setRequestId(j.requestId)
			setStep(3)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally { setLoading(false) }
	}

	const copyMessage = async () => {
		try {
			await navigator.clipboard.writeText(initData?.message || '')
			setCopiedMsg(true)
			setTimeout(() => setCopiedMsg(false), 1500)
		} catch { }
	}

	return (
		<div className="min-h-screen bg-white text-gray-900">
			<div className="max-w-3xl mx-auto px-4 py-10">
				<Card className="shadow-md border-gray-200">
					<CardHeader className="border-b">
						<div className="flex items-center justify-between">
							<CardTitle className="text-lg font-bold flex items-center gap-2"><Award className="h-5 w-5 text-blue-600" />Redeem Reward</CardTitle>
							<span className="text-sm text-gray-600">Step {step} of 3</span>
						</div>
						<CardDescription>
							Submit a redemption request and prove ownership of your payout address.
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-6">
						{error && (
							<div className="p-3 rounded-md border border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>
						)}

						{step === 1 && (
							<div className="space-y-4">
								<div className={`p-4 rounded-lg border ${pending ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
									<p className="text-sm text-gray-700">Payout address:</p>
									<p className="font-mono text-sm text-gray-900 break-all">{stats?.bitcoinAddress || '—'}</p>
									<p className="mt-2 text-sm text-gray-700">Available credits:</p>
									<p className="font-semibold">{(stats?.availableCredits ?? 0).toFixed(3)}</p>
									{dist && (
										<div className="mt-4 text-sm text-gray-700 space-y-1">
											<p><strong>Current puzzle balance:</strong> {dist.balanceBtc.toFixed(8)} BTC</p>
											<p><strong>Pool reward (25%):</strong> {dist.poolShareBtc.toFixed(8)} BTC</p>
											<p><strong>Your contribution share:</strong> {dist.userSharePercent.toFixed(2)}%</p>
											<p><strong>Estimated payout if solved:</strong> {dist.expectedRewardBtc.toFixed(8)} BTC</p>
										</div>
									)}
									{solvedPuzzles.length > 0 && (
										<div className="mt-4">
											<p className="text-sm text-gray-700 font-medium">Choose puzzle to redeem</p>
											<div className="mt-2 space-y-2">
												{solvedPuzzles.map(pz => (
													<label key={pz.id} className="flex items-center gap-2 text-sm">
														<input type="radio" name="select-puzzle" value={pz.id} checked={selectedPuzzleId === pz.id} onChange={e => setSelectedPuzzleId(e.target.value)} />
														<span className="font-mono break-all">{pz.address}</span>
														{pz.active ? <Badge className="bg-blue-100 text-blue-700 border border-blue-300">Active</Badge> : null}
														<span className="ml-2 text-gray-700">Share: {(dist?.userSharePercent ?? 0).toFixed(2)}%</span>
														<span className="ml-2 text-gray-700">Est. payout: {(((pz.poolShareBtc || 0) * ((dist?.userSharePercent ?? 0) / 100))).toFixed(8)} BTC</span>
													</label>
												))}
											</div>
										</div>
									)}
									{pending && (
										<div className="mt-4 p-3 rounded-md border border-amber-300 bg-amber-100 text-amber-800 text-sm">
											<div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Pending redemption request</div>
											<ul className="mt-2 space-y-1">
												<li><strong>Request ID:</strong> {pending.id}</li>
												<li><strong>Address:</strong> <span className="font-mono break-all">{pending.address}</span></li>
												<li><strong>Amount:</strong> {pending.amount.toFixed(3)} credits</li>
												{pending.createdAt && (<li><strong>Created:</strong> {new Date(pending.createdAt).toLocaleString()}</li>)}
											</ul>
											<p className="mt-2">You cannot create a new request until the current one is approved or denied by the admin.</p>
										</div>
									)}
								</div>
								{!pending && (<div className="text-sm text-gray-700">Redeeming full available balance automatically.</div>)}
								<div className="flex items-center justify-end gap-2">
									<Button variant="outline" onClick={() => router.push('/dashboard')}>Cancel</Button>
									<Button onClick={startInit} disabled={loading || !stats || !!pending}><ArrowRight className="h-4 w-4" /> Continue</Button>
								</div>
							</div>
						)}

						{step === 2 && initData && (
							<div className="space-y-4">
								<div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
									<p className="text-sm text-gray-700 mb-2">Sign the message below using the wallet that controls your payout address.</p>
									<pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white border border-gray-200 rounded-md p-3">{initData.message}</pre>
									<div className="mt-2 flex items-center gap-2">
										<Button variant="outline" onClick={copyMessage}><Copy className="h-4 w-4" /> {copiedMsg ? 'Copied' : 'Copy message'}</Button>
									</div>
								</div>
								<div>
									<label className="text-sm text-gray-700 font-medium">Paste signature</label>
									<Input value={signature} onChange={(e: ChangeEvent<HTMLInputElement>) => setSignature(e.target.value)} placeholder="Signature (base64)" />
								</div>
								<div className="flex items-center justify-end gap-2">
									<Button variant="outline" onClick={() => setStep(1)}>Back</Button>
									<Button onClick={verifyAndSubmit} disabled={loading || !signature.trim()}><CheckCircle2 className="h-4 w-4" /> Verify & Submit</Button>
								</div>
							</div>
						)}

						{step === 3 && requestId && initData && (
							<div className="space-y-4">
								<div className="bg-green-50 border border-green-200 p-4 rounded-lg">
									<p className="text-sm text-gray-700">Redemption request submitted.</p>
									<ul className="mt-2 text-sm text-gray-800 space-y-1">
										<li><strong>Address:</strong> <span className="font-mono break-all">{initData.address}</span></li>
										<li><strong>Amount:</strong> {initData.amount.toFixed(3)} credits</li>
										<li><strong>Request ID:</strong> {requestId}</li>
									</ul>
								</div>
								<div className="flex items-center justify-end gap-2">
									<Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
				<Card className="shadow-sm border-gray-200 mt-8">
					<CardHeader className="border-b">
						<div className="flex items-center justify-between">
							<CardTitle className="text-base font-semibold">Redemption History</CardTitle>
							<span className="text-xs text-gray-600">{historyLoading ? 'Loading…' : `${historyItems.length} item(s)`}</span>
						</div>
						<CardDescription>Track the progress of your redemption requests.</CardDescription>
					</CardHeader>
					<CardContent className="pt-4">
						{historyItems.length === 0 && !historyLoading ? (
							<div className="text-sm text-gray-600">No history yet.</div>
						) : (
							<Table>
								<TableHeader className="bg-gray-50">
									<TableRow>
										<TableHead className="py-2 px-2">ID</TableHead>
										<TableHead className="py-2 px-2">Puzzle</TableHead>
										<TableHead className="py-2 px-2">Amount</TableHead>
										<TableHead className="py-2 px-2">Status</TableHead>
										<TableHead className="py-2 px-2">Created</TableHead>
										<TableHead className="py-2 px-2">Updated</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{historyItems.map(h => (
										<TableRow key={h.id} className="text-xs">
											<TableCell className="py-2 px-2 font-mono break-all">{h.id}</TableCell>
											<TableCell className="py-2 px-2 font-mono break-all">{h.puzzleAddress || '-'}</TableCell>
											<TableCell className="py-2 px-2">{h.amount.toFixed(3)} credits</TableCell>
											<TableCell className="py-2 px-2">
												{h.status === 'PAID' ? <Badge className="bg-green-100 text-green-700 border border-green-300">Paid</Badge> : h.status === 'CANCELED' ? <Badge className="bg-gray-100 text-gray-700 border border-gray-300">Canceled</Badge> : h.status === 'APPROVED' ? <Badge className="bg-blue-100 text-blue-700 border border-blue-300">Approved</Badge> : h.status === 'DENIED' ? <Badge className="bg-red-100 text-red-700 border border-red-300">Denied</Badge> : <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-300">Pending</Badge>}
											</TableCell>
											<TableCell className="py-2 px-2">{h.createdAt ? new Date(h.createdAt).toLocaleString() : '-'}</TableCell>
											<TableCell className="py-2 px-2">{h.updatedAt ? new Date(h.updatedAt).toLocaleString() : '-'}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
