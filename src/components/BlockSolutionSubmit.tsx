'use client'

import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { XCircle, Key, RefreshCw, ClipboardPaste, CheckCircle2 } from 'lucide-react'
import { deriveBitcoinAddressFromPrivateKeyHex } from '@/lib/utils'

export default function BlockSolutionSubmit({ blockId, rangeStart, rangeEnd, checkworkAddresses }: { blockId: string, rangeStart?: string, rangeEnd?: string, checkworkAddresses?: string[] }) {
	const [keysText, setKeysText] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const parsedKeys = useMemo(() => keysText
		.split(/\s|,|;|\n|\r/)
		.map(s => s.trim())
		.filter(s => s.length > 0)
		.slice(0, 30), [keysText])

	const validCount = useMemo(() => parsedKeys.filter(k => {
		const clean = k.startsWith('0x') ? k.slice(2) : k
		return /^[0-9a-fA-F]{64}$/.test(clean)
	}).length, [parsedKeys])

	const canSubmit = validCount >= 10 && !!blockId

	async function handlePaste() {
		try { const t = await navigator.clipboard.readText(); setKeysText(t) } catch { }
	}

	function handleExtractHexKeys() {
		const all = keysText.match(/0x?[0-9a-fA-F]{64}/g) || []
		const cleaned = all.map(s => s.trim())
		setKeysText(cleaned.join('\n'))
	}

	const liveMatches = useMemo(() => {
		const addrs = new Set((checkworkAddresses || []).map(a => a.trim()))
		const matches: Array<{ address: string, key: string }> = []
		const unmatched: string[] = []
		for (const k of parsedKeys) {
			const addr = deriveBitcoinAddressFromPrivateKeyHex(k)
			if (addrs.has(addr)) matches.push({ address: addr, key: k })
			else unmatched.push(k)
		}
		return { matches, unmatched }
	}, [parsedKeys, checkworkAddresses])

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
			const token = typeof window !== 'undefined' ? localStorage.getItem('pool-token') : null
			if (!token) { throw new Error('No token found') }
			const r = await fetch('/api/block/submit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'pool-token': token },
				body: JSON.stringify({ privateKeys: limited, blockId }),
			})
			const j = await r.json().catch(() => ({}))
			if (!r.ok) { throw new Error(String(j?.error || 'Failed to submit block')) }
			setKeysText('')
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to submit block')
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Card className="bg-white border-gray-200 shadow-md">
			<CardHeader className='border-b pb-4'>
				<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
					<Key className="h-5 w-5 text-purple-600" /> Solution Submission
				</CardTitle>
				<CardDescription className='text-gray-600'>Paste, format, validate in real-time, and submit keys{rangeStart && rangeEnd ? ` for ${rangeStart}…${rangeEnd}` : ''}.</CardDescription>
			</CardHeader>
			<CardContent className='pt-6'>
				<form onSubmit={handleSubmit} className="space-y-4">
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

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
						<div>
							<div className="text-xs font-semibold text-gray-800 mb-2 inline-flex items-center gap-1"><CheckCircle2 className='w-3 h-3 text-green-700' /> Matched Now ({liveMatches.matches.length})</div>
							<div className="space-y-1 max-h-40 overflow-y-auto pr-2 bg-green-50 p-2 rounded-lg border border-green-200">
								{liveMatches.matches.map((m, i) => (
									<div key={`m-${i}`} className="text-[11px] font-mono text-green-700 break-all">{m.address}</div>
								))}
								{liveMatches.matches.length === 0 && (
									<div className="text-xs text-green-700 opacity-70">No matches yet.</div>
								)}
							</div>
						</div>
						<div>
							<div className="text-xs font-semibold text-gray-800 mb-2">Unmatched Now ({liveMatches.unmatched.length})</div>
							<div className="space-y-1 max-h-40 overflow-y-auto pr-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
								{liveMatches.unmatched.map((k, i) => (
									<div key={`u-${i}`} className="text-[11px] font-mono text-gray-800 break-all">{k}</div>
								))}
								{liveMatches.unmatched.length === 0 && (
									<div className="text-xs text-gray-600 opacity-70">All parsed keys currently match checkwork.</div>
								)}
							</div>
						</div>
					</div>
				</form>
			</CardContent>
		</Card>
	)
}
