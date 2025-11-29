'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Bitcoin, ArrowRight, CheckCircle2, Copy } from 'lucide-react'
import { isValidBitcoinAddress } from '@/lib/formatRange'

type Stats = {
	token: string
	bitcoinAddress: string
	availableCredits: number
}

type InitResponse = {
	message: string
	nonce: string
	amount: number
	fromAddress: string
	toAddress: string
}

type ConfirmResponse = {
	success: boolean
	spentAmount: number
	newAvailableCredits: number
	transactionId: string
}

export default function TransferCreditsWizard() {
	const router = useRouter()
	const [step, setStep] = useState<number>(1)
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

	const token = useMemo(() => {
		try {
			return localStorage.getItem('pool-token') || ''
		} catch { return '' }
	}, [])

	useEffect(() => {
		let mounted = true
			; (async () => {
				try {
					const r = await fetch('/api/user/stats', { headers: { 'pool-token': token } })
					if (!r.ok) throw new Error('Failed to load stats')
					const j = await r.json()
					if (mounted) setStats({ token: j.token, bitcoinAddress: j.bitcoinAddress, availableCredits: Number(j.availableCredits || 0) })
				} catch (e) {
					setError('Unable to fetch user stats. Ensure you have a valid token.')
				}
			})()
		return () => { mounted = false }
	}, [token])

	const startInit = async () => {
		setError(null)
		setToError('')
		setAmountError('')
		if (!stats) return
		const dest = toAddress.trim()
		if (!isValidBitcoinAddress(dest)) {
			setToError('Please enter a valid Bitcoin address')
			return
		}
		const parsed = Number(amountText)
		const max = Number(stats.availableCredits || 0)
		if (!isFinite(parsed) || parsed <= 0) {
			setAmountError('Enter a valid amount greater than 0')
			return
		}
		if (parsed > max) {
			setAmountError('Amount exceeds available credits')
			return
		}
		const rounded = Math.floor(parsed * 1000) / 1000
		setLoading(true)
		try {
			const r = await fetch('/api/credits/transfer/init', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'pool-token': token },
				body: JSON.stringify({ toAddress: dest, amount: rounded })
			})
			if (!r.ok) {
				const j = await r.json().catch(() => ({}))
				throw new Error(j?.error || 'Failed to initialize transfer')
			}
			const j: InitResponse = await r.json()
			setInitData(j)
			setStep(2)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally { setLoading(false) }
	}

	const verifyAndConfirm = async () => {
		setError(null)
		if (!initData || !signature.trim()) {
			setError('Paste the signature to continue')
			return
		}
		setLoading(true)
		try {
			const r = await fetch('/api/credits/transfer/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'pool-token': token },
				body: JSON.stringify({ nonce: initData.nonce, signature: signature.trim() })
			})
			const j = await r.json()
			if (!r.ok || !j?.success) {
				throw new Error(j?.error || 'Signature verification failed')
			}
			setConfirmResult(j)
			setStep(4)
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
							<CardTitle className="text-lg font-bold flex items-center gap-2"><Bitcoin className="h-5 w-5 text-blue-600" />Transfer Credits</CardTitle>
							<span className="text-sm text-gray-600">Step {step} of 4</span>
						</div>
						<CardDescription>
							Move your available credits to another Bitcoin address using a signed ownership proof.
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-6">
						{error && (
							<div className="p-3 rounded-md border border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>
						)}

						{step === 1 && (
							<div className="space-y-4">
								<div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
									<p className="text-sm text-gray-700">Source (your payout address):</p>
									<p className="font-mono text-sm text-gray-900 break-all">{stats?.bitcoinAddress || '—'}</p>
									<p className="mt-2 text-sm text-gray-700">Available credits:</p>
									<p className="font-semibold">{(stats?.availableCredits ?? 0).toFixed(3)}</p>
								</div>
								<div>
									<label className="text-sm text-gray-700 font-medium">Destination Bitcoin address</label>
									<Input value={toAddress} onChange={e => setToAddress(e.target.value)} placeholder="Enter destination address" />
									{toError && <p className="text-xs text-red-600 mt-1">{toError}</p>}
								</div>
								<div>
									<label className="text-sm text-gray-700 font-medium">Amount to transfer (credits)</label>
									<Input value={amountText} onChange={e => setAmountText(e.target.value)} placeholder="e.g. 1.500" />
									<p className="text-xs text-gray-600 mt-1">Up to {(stats?.availableCredits ?? 0).toFixed(3)} credits; rounded to 0.001</p>
									{amountError && <p className="text-xs text-red-600 mt-1">{amountError}</p>}
								</div>
								<div className="flex items-center justify-end gap-2">
									<Button variant="outline" onClick={() => router.push('/dashboard')}>Cancel</Button>
									<Button onClick={startInit} disabled={loading || !stats}><ArrowRight className="h-4 w-4" /> Continue</Button>
								</div>
							</div>
						)}

						{step === 2 && initData && (
							<div className="space-y-4">
								<div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
									<p className="text-sm text-gray-700 mb-2">Sign the message below using the wallet that controls your source address.</p>
									<pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white border border-gray-200 rounded-md p-3">{initData.message}</pre>
									<div className="mt-2 flex items-center gap-2">
										<Button variant="outline" onClick={copyMessage}><Copy className="h-4 w-4" /> {copiedMsg ? 'Copied' : 'Copy message'}</Button>
									</div>
								</div>
								<div>
									<label className="text-sm text-gray-700 font-medium">Paste signature</label>
									<Input value={signature} onChange={e => setSignature(e.target.value)} placeholder="Signature (base64)" />
								</div>
								<div className="flex items-center justify-end gap-2">
									<Button variant="outline" onClick={() => setStep(1)}>Back</Button>
									<Button onClick={verifyAndConfirm} disabled={loading || !signature.trim()}><CheckCircle2 className="h-4 w-4" /> Verify & Continue</Button>
								</div>
							</div>
						)}

						{step === 4 && confirmResult && initData && (
							<div className="space-y-4">
								<div className="bg-green-50 border border-green-200 p-4 rounded-lg">
									<p className="text-sm text-gray-700">Transfer successful.</p>
									<ul className="mt-2 text-sm text-gray-800 space-y-1">
										<li><strong>From:</strong> <span className="font-mono break-all">{initData.fromAddress}</span></li>
										<li><strong>To:</strong> <span className="font-mono break-all">{initData.toAddress}</span></li>
										<li><strong>Amount:</strong> {confirmResult.spentAmount.toFixed(3)}</li>
										<li><strong>New available credits:</strong> {confirmResult.newAvailableCredits.toFixed(3)}</li>
										<li><strong>Reference:</strong> {confirmResult.transactionId}</li>
									</ul>
								</div>
								<div className="flex items-center justify-end gap-2">
									<Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
								</div>
							</div>
						)}

						{step === 3 && (
							<div className="space-y-4">
								<div className="p-4 rounded-lg border border-gray-200">
									<p className="text-sm text-gray-700">Verifying signature...</p>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
