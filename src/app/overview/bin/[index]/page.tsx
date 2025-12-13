'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Hash, Expand, Clock, Target, CheckCircle2, XCircle, ArrowLeft, ArrowRight, Bitcoin, Key, Gauge, ArrowDownZA } from 'lucide-react'

type BlockItem = {
	id: string
	status: string
	bitcoinAddress: string
	hexRangeStart: string
	hexRangeEnd: string
	createdAt?: string
	expiresAt?: string | null
	completedAt?: string | null
	creditsAwarded: number
}

function parseHexBI(hex: string): bigint {
	const clean = hex.replace(/^0x/, '')
	return BigInt(`0x${clean}`)
}

function formatDeltaScientific(delta: bigint): string {
	if (delta === 0n) return '≈ 0'
	const sign = delta < 0n ? '-' : '+'
	const abs = delta < 0n ? -delta : delta
	const digits = abs.toString() // base-10
	const exp = Math.max(0, digits.length - 1)
	const mantissa = digits.length >= 2 ? `${digits[0]}.${digits.slice(1, 3)}` : `${digits[0]}`
	return `≈ ${sign} ${mantissa} x 10^${exp}`
}

function pow2LenLabel(startHex: string, endHex: string): string {
	try {
		const s = parseHexBI(startHex)
		const e = parseHexBI(endHex)
		const len = e >= s ? (e - s) : 0n
		if (len <= 0n) return '2^0.00'
		const bin = len.toString(2)
		const bitlen = bin.length
		const K = Math.max(0, Math.min(24, bitlen - 1))
		let frac = 0
		if (K > 0) {
			const top = bin.slice(0, K + 1) // includes leading 1
			const val = parseInt(top, 2) / Math.pow(2, K)
			frac = Math.log2(val)
		}
		const exp = (bitlen - 1) + frac
		return `2^${exp.toFixed(2)}`
	} catch {
		return '2^0.00'
	}
}

function scaledKeys(len: bigint): string {
	const UNITS: Array<{ label: string; factor: bigint }> = [
		{ label: 'E', factor: 1_000_000_000_000_000_000n }, // Exa (10^18)
		{ label: 'P', factor: 1_000_000_000_000_000n },     // Peta (10^15)
		{ label: 'T', factor: 1_000_000_000_000n },         // Trillion (10^12)
		{ label: 'B', factor: 1_000_000_000n },             // Billion (10^9)
		{ label: 'M', factor: 1_000_000n },                 // Million (10^6)
		{ label: 'K', factor: 1_000n },                     // Thousand (10^3)
		{ label: '', factor: 1n },                          // Keys
	]
	let idx = UNITS.findIndex(u => len >= u.factor)
	if (idx < 0) idx = UNITS.length - 1
	// Promote to larger unit while value is >= 1000
	while (idx > 0) {
		const u = UNITS[idx]
		const scaledInt = len / u.factor
		if (scaledInt >= 1000n) idx -= 1
		else break
	}
	const u = UNITS[idx]
	const intPart = len / u.factor
	const rem = len % u.factor
	const twoDec = (rem * 100n) / u.factor
	let out: string
	if (intPart >= 100n) {
		out = `${intPart.toString()}${u.label}Keys`
	} else if (intPart >= 10n) {
		const oneDec = twoDec / 10n
		out = `${intPart.toString()}.${oneDec.toString().padStart(1, '0')}${u.label}Keys`
	} else {
		out = `${intPart.toString()}.${twoDec.toString().padStart(2, '0')}${u.label}Keys`
	}
	return out
}

function lengthCompositeLabel(startHex: string, endHex: string): string {
	try {
		const s = parseHexBI(startHex)
		const e = parseHexBI(endHex)
		const len = e >= s ? (e - s) : 0n
		const pow = len > 0n ? pow2LenLabel(startHex, endHex) : '2^0.00'
		const scaled = scaledKeys(len)
		return `${pow} • ${scaled}`
	} catch {
		return '2^0.00 • 0Keys'
	}
}

export default function BinDetailPage() {
	const params = useParams()
	const router = useRouter()
	const sp = useSearchParams()
	const index = String(params?.index || '0')
	const [items, setItems] = useState<BlockItem[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [total, setTotal] = useState(0)
	const [meta, setMeta] = useState<{ index: number; startHex: string; endHex: string } | null>(null)
	const take = 50
	const pageParam = Number(sp.get('page') || 1)
	const page = (isFinite(pageParam) && pageParam > 0) ? pageParam : 1
	const skip = (page - 1) * take

	useEffect(() => {
		const load = async () => {
			try {
				setLoading(true)
				setError(null)
				const r = await fetch(`/api/pool/bin?index=${index}&take=${take}&skip=${skip}`, { cache: 'no-store' })
				if (!r.ok) {
					const j = await r.json().catch(() => ({}))
					throw new Error(String(j.error || 'Failed to load bin'))
				}
				const j = await r.json()
				setItems(Array.isArray(j.items) ? j.items : [])
				setTotal(Number(j.meta?.totalItems || 0))
				setMeta(j.meta ? { index: Number(j.meta.index), startHex: String(j.meta.startHex), endHex: String(j.meta.endHex) } : null)
			} catch (e) {
				setError(e instanceof Error ? e.message : 'Failed to load bin')
			} finally {
				setLoading(false)
			}
		}
		load()
	}, [index, skip])

	const totalPages = useMemo(() => {
		return take > 0 ? Math.max(1, Math.ceil(total / take)) : 1
	}, [total])

	return (
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 text-gray-900">
			<div className="max-w-5xl mx-auto px-4 py-8">
				<div className="mb-4 flex flex-col gap-3 px-4 sm:px-0">

					<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
						<div className='flex items-center gap-3'>
							<Button variant="ghost" onClick={() => router.push('/overview')} className="inline-flex hover:bg-transparent hover:shadow-none cursor-pointer items-center gap-2 text-gray-700 hover:text-blue-600">
								<ArrowLeft className='w-4 h-4' /> Back
							</Button>


							<div className='flex items-center gap-3'>
								<div className="p-3 bg-blue-100 rounded-full"><Hash className="h-5 w-5 text-blue-600" /></div>
								<div>
									<h1 className="text-xl sm:text-2xl font-bold text-gray-900">Bin {meta ? meta.index + 1 : index}</h1>
									{meta && (
										<p className="text-gray-600 text-xs sm:text-sm font-mono break-all flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 mt-1">
											<span className="font-semibold mr-1">Range:</span>
											<span className='flex items-center gap-1'>
												{meta.startHex} <span className="font-semibold text-blue-600">to</span> {meta.endHex}
												<Badge className="bg-blue-100 text-blue-600 text-[11px] sm:text-xs border-blue-500 pt-1">
													{lengthCompositeLabel(meta.startHex, meta.endHex)}
												</Badge>
											</span>
										</p>
									)}
								</div>
							</div>
						</div>


						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 self-start mt-2 sm:mt-0">
							<ArrowDownZA className="h-4 w-4 text-blue-600" />
							<span className="text-xs font-semibold text-blue-700">Latest First</span>
						</div>
					</div>
				</div>

				<Card className="shadow-sm border-gray-200 mb-6">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2"><Target className='h-5 w-5 text-purple-600' /> Blocks</CardTitle>
						<CardDescription className="text-gray-600">Showing {take} per page</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						{loading ? (
							<div className="bg-white border border-gray-200 rounded-md p-4 animate-pulse">
								<div className="h-6 w-40 bg-gray-200 rounded mb-2" />
								<div className="h-4 w-64 bg-gray-200 rounded" />
							</div>
						) : error ? (
							<div className="text-red-700 bg-red-50 border border-red-200 rounded p-3 inline-flex items-center gap-2"><XCircle className='w-5 h-5' /> {error}</div>
						) : items.length === 0 ? (
							<div className="text-gray-600">No blocks in this bin</div>
						) : (
							<div className="space-y-3">
								{items.map((b) => (
									<div key={b.id} className="border rounded-lg p-3 sm:p-4 bg-white shadow-sm">
										<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
											<div className="flex flex-wrap items-center gap-1 sm:gap-2">
												<Badge className="bg-blue-50 text-blue-600 border-blue-600 text-[10px]">ID</Badge>
												<span className="font-mono font-semibold text-gray-900 break-all text-xs sm:text-sm">{b.id}</span>
											</div>
											<div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 mt-2 sm:mt-0">
												{(() => {
													const idx = items.findIndex(it => it.id === b.id)
													const prev = idx > 0 ? items[idx - 1] : null
													const label = prev ? formatDeltaScientific(parseHexBI(b.hexRangeEnd) - parseHexBI(prev.hexRangeEnd)) : '—'
													return (
														<span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-1 rounded text-xs sm:text-sm">{label}</span>
													)
												})()}
												{b.status === 'COMPLETED' ? (
													<span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded text-xs sm:text-sm"><CheckCircle2 className='w-4 h-4' /> Completed</span>
												) : b.status === 'ACTIVE' ? (
													<span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-1 rounded text-xs sm:text-sm"><Gauge className='w-4 h-4' /> Active</span>
												) : (
													<span className="inline-flex items-center gap-1 text-gray-700 bg-gray-100 px-2 py-1 rounded text-xs sm:text-sm">{b.status}</span>
												)}
											</div>
										</div>
										<div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-3">
											<div className="bg-gray-50 rounded p-3 border border-gray-200">
												<div className="text-xs text-gray-500 inline-flex items-center gap-1"><Expand className='w-3 h-3' /> Range</div>
												<div className="space-y-2">
													<div className="text-[11px] text-gray-500">Start</div>
													<div className="font-mono text-gray-900 font-semibold break-all text-xs sm:text-sm">{b.hexRangeStart}</div>
													<div className="text-[11px] text-gray-500 mt-2">End</div>
													<div className="font-mono text-gray-900 font-semibold break-all text-xs sm:text-sm">{b.hexRangeEnd}</div>
												</div>
												<div className="text-xs text-gray-600 italic mt-1 inline-flex items-center gap-1"><Gauge className='w-3 h-3' /> Length <span className="font-semibold">{lengthCompositeLabel(b.hexRangeStart, b.hexRangeEnd)}</span></div>
											</div>
											<div className="bg-gray-50 rounded p-3 border border-gray-200">
												<div className="text-xs text-gray-500 inline-flex items-center gap-1"><Bitcoin className='w-3 h-3' /> Address</div>
												<div className="font-mono text-gray-900 break-all text-xs sm:text-sm">{b.bitcoinAddress}</div>
											</div>
										</div>
										<div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-3 text-xs text-gray-700">
											<div className="inline-flex items-center gap-1"><Clock className='w-3 h-3' /> Created <span className="font-semibold">{b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}</span></div>
											{b.expiresAt && <div className="inline-flex items-center gap-1">Expires <span className="font-semibold">{new Date(b.expiresAt).toLocaleString()}</span></div>}
											{b.completedAt && <div className="inline-flex items-center gap-1">Completed <span className="font-semibold">{new Date(b.completedAt).toLocaleString()}</span></div>}
											{b.creditsAwarded > 0 && <div className="inline-flex items-center gap-1"><Key className='w-3 h-3' /> Credits <span className="font-semibold">{b.creditsAwarded.toFixed(3)}</span></div>}
										</div>
									</div>
								))}
							</div>
						)}
						<div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
							<Button variant="outline" disabled={page <= 1} onClick={() => router.push(`/overview/bin/${index}?page=${page - 1}`)} className="inline-flex items-center gap-2"><ArrowLeft className='w-4 h-4' /> Prev</Button>
							<span className="text-sm text-gray-700">Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{totalPages}</span></span>
							<Button variant="outline" disabled={page >= totalPages} onClick={() => router.push(`/overview/bin/${index}?page=${page + 1}`)} className="inline-flex items-center gap-2">Next <ArrowRight className='w-4 h-4' /></Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
