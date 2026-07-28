'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Copy, Award, AlertTriangle, XCircle } from 'lucide-react'
import { useTranslation } from '@/contexts/LanguageContext'

type Stats = { token: string; bitcoinAddress: string; availableCredits: number }
type InitResponse = { message: string; nonce: string; amount: number; address: string }
type Dist = { balanceBtc: number; poolShareBtc: number; totalAvailableCredits: number; userAvailableCredits: number; userSharePercent: number; expectedRewardBtc: number }
type PendingRedeem = { id: string; amount: number; address: string; createdAt?: string }
type HistoryItem = { id: string; amount: number; status: string; createdAt?: string | null; updatedAt?: string | null; puzzleAddress?: string | null }
type SolvedPuzzleMeta = { id: string; name?: string | null; address: string; active?: boolean; balanceBtc?: number; poolShareBtc?: number }

const STATUS_STYLE: Record<string, string> = {
	PAID: 'volt-badge-success',
	APPROVED: 'volt-badge-accent',
	PENDING: 'volt-badge-neutral',
	DENIED: 'volt-badge-danger',
	CANCELED: 'volt-badge-neutral',
}

export default function RedeemRewardWizard() {
	const { t } = useTranslation()
	const router = useRouter()
	const [step, setStep] = useState(1)
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
	const [selectedPuzzleId, setSelectedPuzzleId] = useState('')

	const token = useMemo(() => { try { return localStorage.getItem('pool-token') || '' } catch { return '' } }, [])

	useEffect(() => {
		let mounted = true
		;(async () => {
			try {
				const r = await fetch('/api/user/stats', { headers: { 'pool-token': token } })
				if (!r.ok) throw new Error('Failed to load stats')
				const j = await r.json()
				if (mounted) setStats({ token: j.token, bitcoinAddress: j.bitcoinAddress, availableCredits: Number(j.availableCredits || 0) })
			} catch { setError('Unable to fetch user stats. Ensure you have a valid token.') }

			try {
				const d = await fetch('/api/pool/distribution', { headers: { 'pool-token': token } })
				if (d.ok && mounted) setDist(await d.json())
			} catch { }

			try {
				const s = await fetch('/api/redeem/status', { headers: { 'pool-token': token } })
				if (s.ok) {
					const sj = await s.json()
					if (sj?.status === 'PENDING' && mounted)
						setPending({ id: String(sj.id || ''), amount: Number(sj.amount || 0), address: String(sj.address || ''), createdAt: String(sj.createdAt || '') })
				}
			} catch { }

			try {
				setHistoryLoading(true)
				const h = await fetch('/api/redeem/list', { headers: { 'pool-token': token } })
				if (h.ok) {
					const hj = await h.json()
					if (mounted) setHistoryItems((Array.isArray(hj.items) ? hj.items : []).map((r: Record<string, unknown>) => ({
						id: String(r.id), amount: Number(r.amount || 0), status: String(r.status || 'PENDING'),
						createdAt: r.createdAt ? String(r.createdAt) : null, updatedAt: r.updatedAt ? String(r.updatedAt) : null,
						puzzleAddress: r.puzzleAddress ? String(r.puzzleAddress) : null,
					})))
				}
			} catch { } finally { setHistoryLoading(false) }

			try {
				const p = await fetch('/api/puzzles/solved', { cache: 'no-store' })
				if (p.ok) {
					const pj = await p.json()
					const list = (Array.isArray(pj.items) ? pj.items : [])
						.map((it: Record<string, unknown>) => ({ id: String(it.id), name: it.name ? String(it.name) : null, address: String(it.address), active: !!it.active, balanceBtc: Number(it.balanceBtc || 0), poolShareBtc: Number(it.poolShareBtc || 0) }))
						.filter((p: SolvedPuzzleMeta) => (p.balanceBtc || 0) >= 0.00001)
					if (mounted) {
						setSolvedPuzzles(list)
						if (list.length > 0) setSelectedPuzzleId((list.find((x: SolvedPuzzleMeta) => x.active) || list[0]).id)
					}
				}
			} catch { }
		})()
		return () => { mounted = false }
	}, [token])

	const startInit = async () => {
		setError(null)
		if (!stats) return
		if (solvedPuzzles.length > 0 && !selectedPuzzleId) { setError('Select a puzzle to redeem'); return }
		if (pending) { setError('You already have a pending redemption. Wait for admin review.'); return }
		if (!isFinite(stats.availableCredits) || stats.availableCredits <= 0) { setError('No available credits to redeem'); return }
		setLoading(true)
		try {
			const r = await fetch('/api/redeem/init', { method: 'POST', headers: { 'Content-Type': 'application/json', 'pool-token': token }, body: JSON.stringify({ puzzleId: selectedPuzzleId || undefined }) })
			const j = await r.json()
			if (!r.ok) throw new Error(j?.error || 'Failed to initialize redemption')
			setInitData(j); setStep(2)
		} catch (e) { setError(e instanceof Error ? e.message : String(e)) }
		finally { setLoading(false) }
	}

	const verifyAndSubmit = async () => {
		setError(null)
		if (!initData || !signature.trim()) { setError('Paste the signature to continue'); return }
		setLoading(true)
		try {
			const r = await fetch('/api/redeem/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'pool-token': token }, body: JSON.stringify({ nonce: initData.nonce, signature: signature.trim() }) })
			const j = await r.json()
			if (!r.ok || !j?.success) throw new Error(j?.error || 'Signature verification failed')
			setRequestId(j.requestId); setStep(3)
		} catch (e) { setError(e instanceof Error ? e.message : String(e)) }
		finally { setLoading(false) }
	}

	const copyMessage = async () => {
		try { await navigator.clipboard.writeText(initData?.message || ''); setCopiedMsg(true); setTimeout(() => setCopiedMsg(false), 1500) } catch { }
	}

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
			<div className="max-w-3xl mx-auto px-4 sm:px-7 py-10 space-y-6">

				{/* Wizard card */}
				<div className="volt-card">
					<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('redeem.credits')}</div>
							<div className="flex items-center gap-2">
								<Award className="h-4 w-4" style={{ color: '#fc5c04' }} />
								<span className="text-[19px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('redeem.title')}</span>
							</div>
						</div>
						<span className="volt-badge-neutral">{t('redeem.step')} {step} {t('redeem.of3')}</span>
					</div>

					<div className="px-6 py-6 space-y-5">
						{error && (
							<div className="p-4 rounded-[10px] flex items-start gap-2" style={{ background: '#3a1512', border: '1px solid rgba(240,85,74,0.3)' }}>
								<XCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#f0554a' }} />
								<p className="text-[13px]" style={{ color: '#f0554a' }}>{error}</p>
							</div>
						)}

						{/* Step 1 */}
						{step === 1 && (
							<div className="space-y-4">
								<div className="p-4 rounded-[10px] space-y-3" style={{ background: pending ? 'rgba(252,92,4,0.06)' : '#191919', border: `1px solid ${pending ? 'rgba(252,92,4,0.2)' : '#262624'}` }}>
									<div>
										<p className="text-[12px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{t('redeem.payoutAddress')}</p>
										<p className="font-mono text-[13px] break-all" style={{ color: '#f4f3ee' }}>{stats?.bitcoinAddress || '—'}</p>
									</div>
									<div>
										<p className="text-[12px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{t('redeem.availableCredits')}</p>
										<p className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#3ddc84' }}>{(stats?.availableCredits ?? 0).toFixed(3)}</p>
									</div>
									{dist && (
										<div className="pt-3 space-y-1.5 text-[12.5px]" style={{ borderTop: '1px solid #262624', color: '#9a9892' }}>
											<p>Puzzle balance: <span style={{ color: '#f4f3ee' }}>{dist.balanceBtc.toFixed(8)} BTC</span></p>
											<p>Pool reward (25%): <span style={{ color: '#f4f3ee' }}>{dist.poolShareBtc.toFixed(8)} BTC</span></p>
											<p>Your share: <span style={{ color: '#f4f3ee' }}>{dist.userSharePercent.toFixed(2)}%</span></p>
											<p>Est. payout: <span style={{ color: '#3ddc84', fontWeight: 600 }}>{dist.expectedRewardBtc.toFixed(8)} BTC</span></p>
										</div>
									)}
									{solvedPuzzles.length > 0 && (
										<div className="pt-3" style={{ borderTop: '1px solid #262624' }}>
											<p className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#5c5a55' }}>{t('redeem.choosePuzzle')}</p>
											<div className="space-y-2">
												{solvedPuzzles.map(pz => (
													<label key={pz.id} className="flex items-start gap-2 cursor-pointer text-[12.5px]" style={{ color: '#9a9892' }}>
														<input type="radio" name="select-puzzle" value={pz.id} checked={selectedPuzzleId === pz.id} onChange={e => setSelectedPuzzleId(e.target.value)} className="mt-0.5" />
														<span>
															<span className="font-mono break-all" style={{ color: '#f4f3ee' }}>{pz.address}</span>
															{pz.active && <span className="volt-badge-accent ml-2">{t('redeem.active')}</span>}
															<span className="ml-2">Est: {(((pz.poolShareBtc || 0) * ((dist?.userSharePercent ?? 0) / 100))).toFixed(8)} BTC</span>
														</span>
													</label>
												))}
											</div>
										</div>
									)}
									{pending && (
										<div className="pt-3 p-3 rounded-[10px]" style={{ background: 'rgba(252,92,4,0.08)', border: '1px solid rgba(252,92,4,0.2)', borderTop: 'none' }}>
											<div className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-2" style={{ color: '#fc5c04' }}>
												<AlertTriangle className="h-3.5 w-3.5" /> {t('redeem.pendingRequest')}
											</div>
											<div className="text-[12px] space-y-1" style={{ color: '#9a9892' }}>
												<p>ID: <span className="font-mono" style={{ color: '#f4f3ee' }}>{pending.id}</span></p>
												<p>Address: <span className="font-mono break-all" style={{ color: '#f4f3ee' }}>{pending.address}</span></p>
												<p>Amount: <span style={{ color: '#f4f3ee' }}>{pending.amount.toFixed(3)} credits</span></p>
											</div>
											<p className="text-[11.5px] mt-2" style={{ color: '#5c5a55' }}>{t('redeem.pendingDesc')}</p>
										</div>
									)}
								</div>
								{!pending && <p className="text-[12.5px]" style={{ color: '#5c5a55' }}>{t('redeem.autoBalance')}</p>}
								<div className="flex items-center justify-end gap-2">
									<button className="volt-btn-ghost" onClick={() => router.push('/dashboard')}>{t('common.cancel')}</button>
									<button className="volt-btn-primary" onClick={startInit} disabled={loading || !stats || !!pending}>
										{loading ? <span className="w-4 h-4 rounded-full border-2 border-transparent" style={{ borderTopColor: '#0a0a0a', animation: 'voltSpin 700ms linear infinite' }} /> : <><ArrowRight className="h-4 w-4" /> {t('common.continue')}</>}
									</button>
								</div>
							</div>
						)}

						{/* Step 2 */}
						{step === 2 && initData && (
							<div className="space-y-4">
								<div className="p-4 rounded-[10px] space-y-3" style={{ background: '#191919', border: '1px solid #262624' }}>
									<p className="text-[13px]" style={{ color: '#9a9892' }}>{t('redeem.signMessage')}</p>
									<pre className="text-[12px] font-mono whitespace-pre-wrap break-all p-3 rounded-[10px] overflow-x-auto" style={{ background: '#131313', border: '1px solid #262624', color: '#f4f3ee' }}>{initData.message}</pre>
									<button className="volt-btn-ghost text-[12px]" onClick={copyMessage}>
										{copiedMsg ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#3ddc84' }} /> : <Copy className="h-3.5 w-3.5" />}
										{copiedMsg ? t('common.copied') : t('redeem.copyMessage')}
									</button>
								</div>
								<div>
									<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>{t('redeem.pasteSignature')}</label>
									<div className="volt-input-wrap">
										<input type="text" value={signature} onChange={(e: ChangeEvent<HTMLInputElement>) => setSignature(e.target.value)} placeholder={t('redeem.signaturePlaceholder')} />
									</div>
								</div>
								<div className="flex items-center justify-end gap-2">
									<button className="volt-btn-ghost" onClick={() => setStep(1)}>{t('redeem.back')}</button>
									<button className="volt-btn-primary" onClick={verifyAndSubmit} disabled={loading || !signature.trim()}>
										{loading ? <span className="w-4 h-4 rounded-full border-2 border-transparent" style={{ borderTopColor: '#0a0a0a', animation: 'voltSpin 700ms linear infinite' }} /> : <><CheckCircle2 className="h-4 w-4" /> {t('redeem.verifySubmit')}</>}
									</button>
								</div>
							</div>
						)}

						{/* Step 3 */}
						{step === 3 && requestId && initData && (
							<div className="space-y-4">
								<div className="p-4 rounded-[10px] space-y-2" style={{ background: '#123420', border: '1px solid rgba(61,220,132,0.3)' }}>
									<div className="flex items-center gap-2 mb-2">
										<CheckCircle2 className="h-4 w-4" style={{ color: '#3ddc84' }} />
										<span className="text-[14px] font-semibold" style={{ color: '#3ddc84' }}>{t('redeem.submitted')}</span>
									</div>
									<div className="text-[12.5px] space-y-1" style={{ color: '#9a9892' }}>
										<p>Address: <span className="font-mono break-all" style={{ color: '#f4f3ee' }}>{initData.address}</span></p>
										<p>Amount: <span style={{ color: '#f4f3ee' }}>{initData.amount.toFixed(3)} credits</span></p>
										<p>Request ID: <span className="font-mono" style={{ color: '#f4f3ee' }}>{requestId}</span></p>
									</div>
								</div>
								<div className="flex justify-end">
									<button className="volt-btn-primary" onClick={() => router.push('/dashboard')}>{t('redeem.goToDashboard')}</button>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* History */}
				<div className="volt-card">
					<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
						<div className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('redeem.history')}</div>
						<span className="volt-badge-neutral">{historyLoading ? 'Loading…' : `${historyItems.length} item(s)`}</span>
					</div>
					{historyItems.length === 0 && !historyLoading ? (
						<div className="px-6 py-8 text-center text-[13px]" style={{ color: '#5c5a55' }}>{t('redeem.noHistory')}</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-[12.5px]">
								<thead>
									<tr style={{ borderBottom: '1px solid #262624' }}>
										{[t('redeem.table.id'), t('redeem.table.puzzle'), t('redeem.table.amount'), t('redeem.table.status'), t('redeem.table.created'), t('redeem.table.updated')].map(h => (
											<th key={h} className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{h}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{historyItems.map(h => (
										<tr key={h.id} style={{ borderBottom: '1px solid #262624' }}>
											<td className="px-4 py-3 font-mono" style={{ color: '#9a9892' }}>{h.id.substring(0, 12)}…</td>
											<td className="px-4 py-3 font-mono max-w-xs truncate" style={{ color: '#9a9892' }}>{h.puzzleAddress || '—'}</td>
											<td className="px-4 py-3" style={{ color: '#f4f3ee' }}>{h.amount.toFixed(3)}</td>
											<td className="px-4 py-3"><span className={STATUS_STYLE[h.status] ?? 'volt-badge-neutral'}>{h.status}</span></td>
											<td className="px-4 py-3" style={{ color: '#5c5a55' }}>{h.createdAt ? new Date(h.createdAt).toLocaleString() : '—'}</td>
											<td className="px-4 py-3" style={{ color: '#5c5a55' }}>{h.updatedAt ? new Date(h.updatedAt).toLocaleString() : '—'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
