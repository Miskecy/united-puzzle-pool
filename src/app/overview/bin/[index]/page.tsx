'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Hash, Expand, Clock, Target, CheckCircle2, XCircle, ArrowLeft, ArrowRight, Bitcoin, Key, Gauge } from 'lucide-react'

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
				<div className="mb-6 flex items-center justify-between">
					<div className='flex items-center gap-3'>
						<Button variant="ghost" onClick={() => router.push('/overview')} className="inline-flex items-center gap-2 text-gray-700 hover:text-blue-600"><ArrowLeft className='w-4 h-4' /> Back</Button>
						<div className="p-3 bg-blue-100 rounded-full"><Hash className="h-5 w-5 text-blue-600" /></div>
						<div>
							<h1 className="text-2xl font-bold text-gray-900">Bin {meta ? meta.index + 1 : index}</h1>
							{meta && (
								<p className="text-gray-600 text-sm font-mono"><span className="font-semibold">Range:</span> {meta.startHex} <span className="italic text-gray-500">to</span> {meta.endHex}</p>
							)}
						</div>
					</div>
					<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200">
						<Clock className="h-4 w-4 text-blue-600" />
						<span className="text-xs font-semibold text-blue-700">Latest First</span>
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
									<div key={b.id} className="border rounded-lg p-4 bg-white shadow-sm">
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-2">
												<Badge className="bg-gray-100 text-gray-800 border-gray-300 text-[10px]">ID</Badge>
												<span className="font-mono font-semibold text-gray-900">{b.id}</span>
											</div>
											<div className="inline-flex items-center gap-2">
												{b.status === 'COMPLETED' ? (
													<span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded"><CheckCircle2 className='w-4 h-4' /> Completed</span>
												) : b.status === 'ACTIVE' ? (
													<span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-1 rounded"><Gauge className='w-4 h-4' /> Active</span>
												) : (
													<span className="inline-flex items-center gap-1 text-gray-700 bg-gray-100 px-2 py-1 rounded">{b.status}</span>
												)}
											</div>
										</div>
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
											<div className="bg-gray-50 rounded p-3 border border-gray-200">
												<div className="text-xs text-gray-500 inline-flex items-center gap-1"><Expand className='w-3 h-3' /> Range</div>
												<div className="font-mono text-gray-900 font-semibold"><span>{b.hexRangeStart}</span> <span className="italic text-gray-600">to</span> <span>{b.hexRangeEnd}</span></div>
											</div>
											<div className="bg-gray-50 rounded p-3 border border-gray-200">
												<div className="text-xs text-gray-500 inline-flex items-center gap-1"><Bitcoin className='w-3 h-3' /> Address</div>
												<div className="font-mono text-gray-900">{b.bitcoinAddress}</div>
											</div>
										</div>
										<div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-700">
											<div className="inline-flex items-center gap-1"><Clock className='w-3 h-3' /> Created <span className="font-semibold">{b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}</span></div>
											{b.expiresAt && <div className="inline-flex items-center gap-1">Expires <span className="font-semibold">{new Date(b.expiresAt).toLocaleString()}</span></div>}
											{b.completedAt && <div className="inline-flex items-center gap-1">Completed <span className="font-semibold">{new Date(b.completedAt).toLocaleString()}</span></div>}
											{b.creditsAwarded > 0 && <div className="inline-flex items-center gap-1"><Key className='w-3 h-3' /> Credits <span className="font-semibold">{b.creditsAwarded.toFixed(3)}</span></div>}
										</div>
									</div>
								))}
							</div>
						)}
						<div className="mt-6 flex items-center justify-between">
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
