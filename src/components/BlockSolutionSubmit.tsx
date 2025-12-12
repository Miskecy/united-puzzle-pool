'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { XCircle, RefreshCw, ClipboardPaste } from 'lucide-react'

export default function BlockSolutionSubmit({ blockId, rangeStart, rangeEnd, blockBitcoinAddress, onParsedKeysChange }: { blockId: string, rangeStart?: string, rangeEnd?: string, blockBitcoinAddress?: string, onParsedKeysChange?: (keys: string[]) => void }) {
	const [keysText, setKeysText] = useState('')
	const [credentialInput, setCredentialInput] = useState('')
	const [hasStoredToken, setHasStoredToken] = useState(false)
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

	const canSubmit = validCount >= 10 && !!blockId && (
		(hasStoredToken && credentialInput.trim().length > 0) ||
		(!hasStoredToken && !!blockBitcoinAddress && credentialInput.trim() === blockBitcoinAddress)
	)

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
			if (t) {
				setHasStoredToken(true)
				setCredentialInput(t)
			} else {
				setHasStoredToken(false)
			}
		} catch {
			setHasStoredToken(false)
		}
	}, [])

	async function handlePaste() {
		try { const t = await navigator.clipboard.readText(); setKeysText(t) } catch { }
	}

	function handleExtractHexKeys() {
		const all = keysText.match(/(?:0[xX])?[0-9a-fA-F]{64}/g) || []
		const cleaned = all.map(s => s.trim())
		setKeysText(cleaned.join('\n'))
	}


	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError(null)
		if (!blockId) { setError('No block id'); return }
		const limited = parsedKeys
		if (limited.length < 10) { setError('Provide at least 10 private keys'); return }
		const invalid = limited.filter(k => { const c = k.startsWith('0x') ? k.slice(2) : k; return !/^[0-9a-fA-F]{64}$/.test(c) })
		if (invalid.length > 0) { setError('All keys must be 64 hex chars'); return }
		try {
			setSubmitting(true)
			const headerValue = credentialInput.trim()
			if (!headerValue) { throw new Error('No token or address provided') }
			const r = await fetch('/api/block/submit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'pool-token': headerValue },
				body: JSON.stringify({ privateKeys: limited, blockId }),
			})
			const j = await r.json().catch(() => ({}))
			if (!r.ok) {
				if (j?.error === 'Invalid token' && !hasStoredToken && blockBitcoinAddress && headerValue === blockBitcoinAddress) {
					throw new Error('Invalid token: address mode is not supported by API. Please enter your pool token.')
				}
				throw new Error(String(j?.error || 'Failed to submit block'))
			}
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
			<div className="space-y-2">
				<label className="block text-xs text-gray-600">Token or Bitcoin Address</label>
				<Input value={credentialInput} onChange={e => setCredentialInput(e.target.value)} placeholder="Enter your pool token (or your address if token was lost)" className="font-mono text-sm" />
			</div>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className={`px-2 py-1 rounded border text-xs font-semibold ${validCount >= 10 ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'}`}>Valid: {validCount} / 10</span>
					<span className="px-2 py-1 rounded bg-gray-100 border text-xs text-gray-700">Parsed: {parsedKeys.length}</span>
				</div>
				<Button type="button" variant="outline" onClick={handlePaste} className="inline-flex items-center gap-1">
					<ClipboardPaste className="h-4 w-4" /> Paste
				</Button>
			</div>

			<label className="block text-xs text-gray-600">Private Keys (10 required, hex format)</label>
			<textarea
				value={keysText}
				onChange={e => setKeysText(e.target.value)}
				className="w-full min-h-[260px] px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
				placeholder="Paste one key per line, or separated by spaces/commas."
			/>

			<div className="flex flex-wrap gap-3 pt-2">
				<Button type="submit" disabled={submitting || !canSubmit} className="bg-purple-600 text-white hover:bg-purple-700 font-semibold inline-flex items-center gap-2">
					{submitting ? (<><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</>) : 'Submit Keys'}
				</Button>
				<Button type="button" onClick={handleExtractHexKeys} variant='outline' className="text-gray-700 hover:bg-gray-200">Extract 0x Keys</Button>
				<Button type="button" onClick={() => setKeysText('')} variant='outline' className="text-red-600 border-red-400 hover:bg-red-50 inline-flex items-center gap-1"><XCircle className='w-4 h-4' /> Clear All</Button>
			</div>
			{error && (
				<p className='text-red-600 text-sm pt-2 inline-flex items-center gap-1'><XCircle className='w-4 h-4' /> {error}</p>
			)}


		</form>
	)
}
