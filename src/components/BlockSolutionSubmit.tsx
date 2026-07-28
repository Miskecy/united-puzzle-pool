'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, RefreshCw, ClipboardPaste } from 'lucide-react'
import { deriveBitcoinAddressFromPrivateKeyHex } from '@/lib/utils'
import { useTranslation } from '@/contexts/LanguageContext'

export default function BlockSolutionSubmit({ blockId, onParsedKeysChange, puzzleAddress }: { blockId: string, onParsedKeysChange?: (keys: string[]) => void, puzzleAddress?: string }) {
	const { t } = useTranslation()
	const [keysText, setKeysText] = useState('')
	const [credentialInput, setCredentialInput] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const router = useRouter()

	const parsedKeys = useMemo(() => keysText
		.split(/\s|,|;|\n|\r/)
		.map(s => s.trim())
		.filter(s => s.length > 0)
		.slice(0, 30), [keysText])

	const validCount = useMemo(() => parsedKeys.filter(k => {
		const clean = k.startsWith('0x') ? k.slice(2) : k
		return /^[0-9a-fA-F]{64}$/.test(clean)
	}).length, [parsedKeys])

	const puzzleKeyDetected = useMemo(() => {
		if (!puzzleAddress) return false
		return parsedKeys.some(k => {
			const clean = k.startsWith('0x') ? k.slice(2) : k
			if (!/^[0-9a-fA-F]{64}$/.test(clean)) return false
			try {
				const addr = deriveBitcoinAddressFromPrivateKeyHex(clean)
				return addr === puzzleAddress
			} catch { return false }
		})
	}, [parsedKeys, puzzleAddress])

	const canSubmit = (validCount >= 10 || (validCount >= 1 && puzzleKeyDetected)) && !!blockId && credentialInput.trim().length > 0

	useEffect(() => {
		const valid = parsedKeys.filter(k => {
			const clean = k.startsWith('0x') ? k.slice(2) : k
			return /^[0-9a-fA-F]{64}$/.test(clean)
		})
		onParsedKeysChange?.(valid)
	}, [parsedKeys, onParsedKeysChange])

	useEffect(() => {
		try {
			const t = typeof window !== 'undefined' ? localStorage.getItem('pool-token') : null
			if (t) setCredentialInput(t)
		} catch { }
	}, [])

	async function handlePaste() {
		try { const t = await navigator.clipboard.readText(); setKeysText(t) } catch { }
	}

	function handleExtractHexKeys() {
		const all = keysText.match(/(?:0[xX])?[0-9a-fA-F]{64}/g) || []
		setKeysText(all.map(s => s.trim()).join('\n'))
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError(null)
		if (!blockId) { setError('No block id'); return }
		const isPuzzle = puzzleKeyDetected
		if (parsedKeys.length < 10 && !isPuzzle) { setError(t('dashboard.submit.errorMinKeys')); return }
		const invalid = parsedKeys.filter(k => { const c = k.startsWith('0x') ? k.slice(2) : k; return !/^[0-9a-fA-F]{64}$/.test(c) })
		if (invalid.length > 0) { setError(t('dashboard.submit.errorHexFormat')); return }
		try {
			setSubmitting(true)
			const headerValue = credentialInput.trim()
			if (!headerValue) throw new Error('Missing pool token')
			const r = await fetch('/api/block/submit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'pool-token': headerValue },
				body: JSON.stringify({ privateKeys: parsedKeys, blockId }),
			})
			const j = await r.json().catch(() => ({}))
			if (!r.ok) throw new Error(String(j?.error || 'Failed to submit block'))
			setKeysText('')
			try { router.refresh() } catch { }
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to submit block')
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-1.5">
				<label className="block text-[12px] font-medium" style={{ color: '#9a9892' }}>{t('dashboard.session.poolToken')}</label>
				<div className="volt-input-wrap">
					<input
						className="w-full bg-transparent font-mono text-[13px] outline-none"
						style={{ color: '#f4f3ee' }}
						value={credentialInput}
						onChange={e => setCredentialInput(e.target.value)}
						placeholder={t('dashboard.token.placeholder')}
					/>
				</div>
			</div>

			<div className="flex items-center justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-2 flex-wrap">
					<span className={validCount >= 10 || (validCount >= 1 && puzzleKeyDetected) ? 'volt-badge-success' : 'volt-badge-danger'}>
						{t('dashboard.submit.validCount').replace('{n}', `${validCount}`)} {puzzleKeyDetected && t('dashboard.submit.puzzleKeyFound')}
					</span>
					<span className="volt-badge-neutral">{t('dashboard.submit.parsed')} {parsedKeys.length}</span>
				</div>
				<button type="button" onClick={handlePaste} className="volt-btn-ghost text-[12px] inline-flex items-center gap-1 px-3">
					<ClipboardPaste className="h-4 w-4" /> {t('dashboard.submit.paste')}
				</button>
			</div>

			<div className="space-y-1.5">
				<label className="block text-[12px] font-medium" style={{ color: '#9a9892' }}>
					{t('dashboard.submit.label')}
				</label>
				<textarea
					value={keysText}
					onChange={e => setKeysText(e.target.value)}
					className="w-full min-h-64 px-3 py-2 rounded-xl text-[12px] font-mono outline-none resize-y"
					style={{ background: '#131313', border: '1px solid #262624', color: '#f4f3ee' }}
					placeholder={t('dashboard.submit.placeholder')}
				/>
			</div>

			<div className="flex flex-wrap gap-3 pt-1">
				<button
					type="submit"
					disabled={submitting || !canSubmit}
					className="volt-btn-primary inline-flex items-center gap-2"
					style={submitting || !canSubmit ? { opacity: 0.5, pointerEvents: 'none' } : {}}
				>
					{submitting ? (<><RefreshCw className="h-4 w-4 animate-spin" /> {t('dashboard.submit.submitting')}</>) : t('dashboard.submit.submitKeys')}
				</button>
				<button type="button" onClick={handleExtractHexKeys} className="volt-btn-ghost text-[13px] px-3">{t('dashboard.submit.extractHex')}</button>
				<button
					type="button"
					onClick={() => setKeysText('')}
					className="volt-btn-danger inline-flex items-center gap-1 text-[13px] px-3"
				>
					<XCircle className="w-4 h-4" /> {t('dashboard.submit.clear')}
				</button>
			</div>

			{error && (
				<div className="rounded-xl p-3 flex items-center gap-2 text-[13px]" style={{ background: '#3a1512', border: '1px solid rgba(240,85,74,0.3)', color: '#f0554a' }}>
					<XCircle className="w-4 h-4 shrink-0" /> {error}
				</div>
			)}
		</form>
	)
}
