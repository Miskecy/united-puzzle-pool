'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Copy, Send, XCircle } from 'lucide-react'
import { isValidBitcoinAddress } from '@/lib/formatRange'
import { useTranslation } from '@/contexts/LanguageContext'

type Stats = { token: string; bitcoinAddress: string; availableCredits: number }
type InitResponse = { message: string; nonce: string; amount: number; fromAddress: string; toAddress: string }
type ConfirmResponse = { success: boolean; spentAmount: number; newAvailableCredits: number; transactionId: string }

export default function TransferCreditsWizard() {
	const { t } = useTranslation()
	const router = useRouter()
	const [step, setStep] = useState(1)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [stats, setStats] = useState<Stats | null>(null)
	const [toAddress, setToAddress] = useState('')
	const [toError, setToError] = useState('')
	const [amountText, setAmountText] = useState('')
	const [amountError, setAmountError] = useState('')
	const [initData, setInitData] = useState<InitResponse | null>(null)
	const [signature, setSignature] = useState('')
	const [copiedMsg, setCopiedMsg] = useState(false)
	const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null)

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
		})()
		return () => { mounted = false }
	}, [token])

	const startInit = async () => {
		setError(null); setToError(''); setAmountError('')
		if (!stats) return
		const dest = toAddress.trim()
		if (!isValidBitcoinAddress(dest)) { setToError('Please enter a valid Bitcoin address'); return }
		const parsed = Number(amountText)
		const max = Number(stats.availableCredits || 0)
		if (!isFinite(parsed) || parsed <= 0) { setAmountError('Enter a valid amount greater than 0'); return }
		if (parsed > max) { setAmountError('Amount exceeds available credits'); return }
		const rounded = Math.floor(parsed * 1000) / 1000
		setLoading(true)
		try {
			const r = await fetch('/api/credits/transfer/init', { method: 'POST', headers: { 'Content-Type': 'application/json', 'pool-token': token }, body: JSON.stringify({ toAddress: dest, amount: rounded }) })
			const j = await r.json()
			if (!r.ok) throw new Error(j?.error || 'Failed to initialize transfer')
			setInitData(j); setStep(2)
		} catch (e) { setError(e instanceof Error ? e.message : String(e)) }
		finally { setLoading(false) }
	}

	const verifyAndConfirm = async () => {
		setError(null)
		if (!initData || !signature.trim()) { setError('Paste the signature to continue'); return }
		setLoading(true)
		try {
			const r = await fetch('/api/credits/transfer/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'pool-token': token }, body: JSON.stringify({ nonce: initData.nonce, signature: signature.trim() }) })
			const j = await r.json()
			if (!r.ok || !j?.success) throw new Error(j?.error || 'Signature verification failed')
			setConfirmResult(j); setStep(4)
		} catch (e) { setError(e instanceof Error ? e.message : String(e)) }
		finally { setLoading(false) }
	}

	const copyMessage = async () => {
		try { await navigator.clipboard.writeText(initData?.message || ''); setCopiedMsg(true); setTimeout(() => setCopiedMsg(false), 1500) } catch { }
	}

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
			<div className="max-w-3xl mx-auto px-4 sm:px-7 py-10">
				<div className="volt-card">
					<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('transfer.credits')}</div>
							<div className="flex items-center gap-2">
								<Send className="h-4 w-4" style={{ color: '#fc5c04' }} />
								<span className="text-[19px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('transfer.title')}</span>
							</div>
						</div>
						<span className="volt-badge-neutral">{t('transfer.step')} {step} {t('transfer.of4')}</span>
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
								<div className="p-4 rounded-[10px] space-y-3" style={{ background: '#191919', border: '1px solid #262624' }}>
									<div>
										<p className="text-[12px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{t('transfer.sourceAddress')}</p>
										<p className="font-mono text-[13px] break-all" style={{ color: '#f4f3ee' }}>{stats?.bitcoinAddress || '—'}</p>
									</div>
									<div>
										<p className="text-[12px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{t('transfer.availableCredits')}</p>
										<p className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#3ddc84' }}>{(stats?.availableCredits ?? 0).toFixed(3)}</p>
									</div>
								</div>
								<div>
									<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>{t('transfer.destinationAddress')}</label>
									<div className="volt-input-wrap" style={toError ? { borderColor: '#f0554a' } : undefined}>
										<input type="text" value={toAddress} onChange={(e: ChangeEvent<HTMLInputElement>) => setToAddress(e.target.value)} placeholder={t('transfer.destinationPlaceholder')} />
									</div>
									{toError && <p className="text-[11.5px] mt-1" style={{ color: '#f0554a' }}>{toError}</p>}
								</div>
								<div>
									<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>{t('transfer.amount')}</label>
									<div className="volt-input-wrap" style={amountError ? { borderColor: '#f0554a' } : undefined}>
										<input type="number" value={amountText} onChange={(e: ChangeEvent<HTMLInputElement>) => setAmountText(e.target.value)} placeholder={t('transfer.amountPlaceholder')} min="0.001" step="0.001" />
									</div>
									<p className="text-[11.5px] mt-1" style={{ color: '#5c5a55' }}>{t('transfer.amountHint').replace('{max}', (stats?.availableCredits ?? 0).toFixed(3))}</p>
									{amountError && <p className="text-[11.5px] mt-1" style={{ color: '#f0554a' }}>{amountError}</p>}
								</div>
								<div className="flex items-center justify-end gap-2">
									<button className="volt-btn-ghost" onClick={() => router.push('/dashboard')}>{t('common.cancel')}</button>
									<button className="volt-btn-primary" onClick={startInit} disabled={loading || !stats}>
										{loading ? <span className="w-4 h-4 rounded-full border-2 border-transparent" style={{ borderTopColor: '#0a0a0a', animation: 'voltSpin 700ms linear infinite' }} /> : <><ArrowRight className="h-4 w-4" /> {t('common.continue')}</>}
									</button>
								</div>
							</div>
						)}

						{/* Step 2 */}
						{step === 2 && initData && (
							<div className="space-y-4">
								<div className="p-4 rounded-[10px] space-y-3" style={{ background: '#191919', border: '1px solid #262624' }}>
									<p className="text-[13px]" style={{ color: '#9a9892' }}>{t('transfer.signMessage')}</p>
									<div className="text-[12.5px] space-y-1 py-2" style={{ color: '#9a9892' }}>
										<p>{t('transfer.from')} <span className="font-mono break-all" style={{ color: '#f4f3ee' }}>{initData.fromAddress}</span></p>
										<p>{t('transfer.to')} <span className="font-mono break-all" style={{ color: '#f4f3ee' }}>{initData.toAddress}</span></p>
										<p>{t('transfer.amountLabel')} <span style={{ color: '#f4f3ee' }}>{initData.amount.toFixed(3)} credits</span></p>
									</div>
									<pre className="text-[12px] font-mono whitespace-pre-wrap break-all p-3 rounded-[10px] overflow-x-auto" style={{ background: '#131313', border: '1px solid #262624', color: '#f4f3ee' }}>{initData.message}</pre>
									<button className="volt-btn-ghost text-[12px]" onClick={copyMessage}>
										{copiedMsg ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#3ddc84' }} /> : <Copy className="h-3.5 w-3.5" />}
										{copiedMsg ? t('common.copied') : t('transfer.copyMessage')}
									</button>
								</div>
								<div>
									<label className="text-[12.5px] font-semibold block mb-1.5" style={{ color: '#9a9892' }}>{t('transfer.pasteSignature')}</label>
									<div className="volt-input-wrap">
										<input type="text" value={signature} onChange={(e: ChangeEvent<HTMLInputElement>) => setSignature(e.target.value)} placeholder={t('transfer.signaturePlaceholder')} />
									</div>
								</div>
								<div className="flex items-center justify-end gap-2">
									<button className="volt-btn-ghost" onClick={() => setStep(1)}>{t('transfer.back')}</button>
									<button className="volt-btn-primary" onClick={verifyAndConfirm} disabled={loading || !signature.trim()}>
										{loading ? <span className="w-4 h-4 rounded-full border-2 border-transparent" style={{ borderTopColor: '#0a0a0a', animation: 'voltSpin 700ms linear infinite' }} /> : <><CheckCircle2 className="h-4 w-4" /> {t('transfer.verifyConfirm')}</>}
									</button>
								</div>
							</div>
						)}

						{/* Step 4 — success */}
						{step === 4 && confirmResult && initData && (
							<div className="space-y-4">
								<div className="p-4 rounded-[10px] space-y-2" style={{ background: '#123420', border: '1px solid rgba(61,220,132,0.3)' }}>
									<div className="flex items-center gap-2 mb-2">
										<CheckCircle2 className="h-4 w-4" style={{ color: '#3ddc84' }} />
										<span className="text-[14px] font-semibold" style={{ color: '#3ddc84' }}>{t('transfer.success')}</span>
									</div>
									<div className="text-[12.5px] space-y-1" style={{ color: '#9a9892' }}>
										<p>{t('transfer.from')} <span className="font-mono break-all" style={{ color: '#f4f3ee' }}>{initData.fromAddress}</span></p>
										<p>{t('transfer.to')} <span className="font-mono break-all" style={{ color: '#f4f3ee' }}>{initData.toAddress}</span></p>
										<p>{t('transfer.amountSent')} <span style={{ color: '#f4f3ee' }}>{confirmResult.spentAmount.toFixed(3)} credits</span></p>
										<p>{t('transfer.newBalance')} <span style={{ color: '#3ddc84', fontWeight: 600 }}>{confirmResult.newAvailableCredits.toFixed(3)} credits</span></p>
										<p>{t('transfer.reference')} <span className="font-mono" style={{ color: '#f4f3ee' }}>{confirmResult.transactionId}</span></p>
									</div>
								</div>
								<div className="flex justify-end">
									<button className="volt-btn-primary" onClick={() => router.push('/dashboard')}>{t('transfer.goToDashboard')}</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
