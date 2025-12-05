"use client"
import { useState } from 'react'

export default function ClientSetup() {
	const [secret, setSecret] = useState('')
	const [msg, setMsg] = useState('')

	async function enter(e: React.FormEvent) {
		e.preventDefault()
		setMsg('')
		if (!secret) { setMsg('Enter the secret'); return }
		const r = await fetch('/api/setup/login', { method: 'POST', headers: { 'x-setup-secret': secret } })
		if (r.ok) {
			try { localStorage.setItem('setup_secret', secret) } catch { }
			window.location.href = '/setup/config'
		} else {
			setMsg('Invalid secret')
		}
	}

	return (
		<div style={{ maxWidth: 420, margin: '40px auto', padding: 20 }}>
			<h1 style={{ fontSize: 24, fontWeight: 600 }}>Setup Login</h1>
			<p style={{ opacity: 0.8 }}>Enter the setup secret to manage puzzles.</p>
			<form onSubmit={enter} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
				<input type="password" placeholder="Secret" value={secret} onChange={e => setSecret(e.target.value)}
					style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6 }} />
				<button type="submit" style={{ padding: '10px 16px', borderRadius: 6, background: '#111', color: '#fff' }}>Enter</button>
				{msg && <div style={{ marginTop: 8 }}>{msg}</div>}
			</form>
		</div>
	)
}
