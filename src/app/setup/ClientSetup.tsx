"use client"
import { useState } from 'react'
import { Lock, ArrowRight, AlertCircle } from 'lucide-react'

export default function ClientSetup() {
	const [secret, setSecret] = useState('')
	const [msg, setMsg] = useState('')
	const [loading, setLoading] = useState(false)

	async function enter(e: React.FormEvent) {
		e.preventDefault()
		setMsg('')
		if (!secret) { setMsg('Enter the setup secret'); return }
		setLoading(true)
		try {
			const r = await fetch('/api/setup/login', {
				method: 'POST',
				headers: { 'x-setup-secret': secret },
			})
			if (r.ok) {
				window.location.href = '/setup/config'
			} else {
				const j = await r.json().catch(() => ({}))
				if (r.status === 429) {
					setMsg('Too many attempts. Try again in a minute.')
				} else {
					setMsg(String(j?.error || 'Invalid secret'))
				}
			}
		} catch {
			setMsg('Connection error. Please try again.')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="min-h-screen bg-volt-bg flex items-center justify-center p-4 volt-fade-in">
			<div className="w-full max-w-sm">

				{/* Logo mark */}
				<div className="flex justify-center mb-8">
					<div className="p-3.5 rounded-2xl" style={{ background: 'rgba(252,92,4,0.12)', border: '1px solid rgba(252,92,4,0.25)' }}>
						<Lock className="h-7 w-7" style={{ color: '#fc5c04' }} />
					</div>
				</div>

				<div className="volt-card overflow-hidden">
					<div className="px-7 pt-7 pb-5" style={{ borderBottom: '1px solid #1e1e1c' }}>
						<h1 className="text-[22px] font-bold mb-1" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>
							Admin Access
						</h1>
						<p className="text-[13px]" style={{ color: '#5c5a55' }}>
							Enter your setup secret to manage puzzles.
						</p>
					</div>

					<form onSubmit={enter} className="px-7 pt-6 pb-7 space-y-4">
						<div className="space-y-1.5">
							<label className="block text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: '#5c5a55' }}>
								Setup Secret
							</label>
							<div className="volt-input-wrap" style={msg ? { borderColor: 'rgba(240,85,74,0.5)' } : {}}>
								<input
									type="password"
									placeholder="••••••••••••"
									value={secret}
									onChange={e => { setSecret(e.target.value); setMsg('') }}
									autoComplete="current-password"
									className="w-full bg-transparent font-mono text-[14px] outline-none"
									style={{ color: '#f4f3ee' }}
									disabled={loading}
								/>
							</div>
						</div>

						{msg && (
							<div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px]" style={{ background: '#3a1512', border: '1px solid rgba(240,85,74,0.25)', color: '#f0554a' }}>
								<AlertCircle className="h-4 w-4 shrink-0" />
								{msg}
							</div>
						)}

						<button
							type="submit"
							disabled={loading || !secret}
							className="volt-btn-primary w-full justify-center gap-2"
							style={loading || !secret ? { opacity: 0.5, pointerEvents: 'none' } : {}}
						>
							{loading ? (
								<>
									<span className="inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: '#0a0a0a', borderTopColor: 'transparent', animation: 'voltSpin 700ms linear infinite' }} />
									Authenticating…
								</>
							) : (
								<>Enter <ArrowRight className="h-4 w-4" /></>
							)}
						</button>
					</form>
				</div>

				<p className="text-center text-[11px] mt-5" style={{ color: '#3d3c38' }}>
					Session expires after 1 hour
				</p>
			</div>
		</div>
	)
}
