import { Gauge, Hash, Clock, ArrowRight, ArrowLeft, Key, Code2, Code, Terminal } from 'lucide-react'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card'
import BlockSolutionSubmit from '@/components/BlockSolutionSubmit'
import CopyButton from '@/components/CopyButton'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'

function formatSpeed(n?: number | null): string {
	if (!n || !isFinite(n) || n <= 0) return '—'
	if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TKeys/s`
	if (n >= 1e9) return `${(n / 1e9).toFixed(2)} BKeys/s`
	if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MKeys/s`
	if (n >= 1e3) return `${(n / 1e3).toFixed(2)} KKeys/s`
	return `${n.toFixed(2)} Keys/s`
}

function mask(addr: string): string {
	const a = addr || ''
	if (!a) return '—'
	const start = a.slice(0, 6)
	const end = a.slice(Math.max(0, a.length - 6))
	return `${start}…${end}`
}

function timeAgoStr(dt?: string | null): string {
	if (!dt) return '—'
	const t = new Date(dt).getTime()
	const now = Date.now()
	const s = Math.max(0, Math.floor((now - t) / 1000))
	if (s < 60) return `${s}s ago`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}min ago`
	const h = Math.floor(m / 60)
	if (h < 24) return `${h}h ago`
	const d = Math.floor(h / 24)
	if (d < 30) return `${d}d ago`
	const mo = Math.floor(d / 30)
	if (mo < 12) return `${mo}mo ago`
	const y = Math.floor(mo / 12)
	return `${y}y ago`
}

function formatDuration(seconds?: number | null): string {
	if (!seconds || seconds <= 0) return '—'
	let rem = seconds
	const d = Math.floor(rem / 86400); rem -= d * 86400
	const h = Math.floor(rem / 3600); rem -= h * 3600
	const m = Math.floor(rem / 60); rem -= m * 60
	const s = rem
	const parts: string[] = []
	if (d) parts.push(`${d}d`)
	if (h) parts.push(`${h}h`)
	if (m) parts.push(`${m}m`)
	if (s) parts.push(`${s}s`)
	return parts.length ? parts.join(' ') : '0s'
}

function formatDifficultyPrecise(lenHexStart: string, lenHexEnd: string): string {
	try {
		const s = BigInt(lenHexStart)
		const e = BigInt(lenHexEnd)
		const diff = e >= s ? (e - s) : 0n
		const len = Number(diff)
		if (!isFinite(len) || len <= 0) return '2^0'
		const pow = `2^${Math.log2(len).toFixed(2)}`
		let unit = 'Keys'
		let num = len
		if (len >= 1e15) { unit = 'PKeys'; num = len / 1e15 }
		else if (len >= 1e12) { unit = 'TKeys'; num = len / 1e12 }
		else if (len >= 1e9) { unit = 'BKeys'; num = len / 1e9 }
		else if (len >= 1e6) { unit = 'MKeys'; num = len / 1e6 }
		else if (len >= 1e3) { unit = 'KKeys'; num = len / 1e3 }
		return `${pow} • ≈ ${num.toFixed(2)} ${unit}`
	} catch {
		return '2^0'
	}
}

interface BlockData {
	id: string;
	bitcoinAddress: string;
	tokenMasked: string;
	hexRangeStart: string;
	hexRangeEnd: string;
	hexRangeStartRaw: string;
	hexRangeEndRaw: string;
	assignedAt: string;
	completedAt?: string | null;
	durationSeconds: number | null;
	keysValidated: number;
	avgSpeedKeysPerSec: number | null;
	creditsAwarded: number;
	checkworkAddresses: string[];
	privateKeys: (string | undefined)[];
	addressMap: { privateKey?: string; address: string; isValid: boolean }[];
	matchedCount: number;
	missingAddresses: string[];
}

export default async function BlockDetailsPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const base = process.env.APP_URL || ''
	let res: Response
	if (base) {
		res = await fetch(`${base}/api/block/${id}`, { cache: 'no-store' })
	} else {
		const h = await headers()
		const host = h.get('host') || 'localhost:3000'
		const proto = h.get('x-forwarded-proto') || 'http'
		res = await fetch(`${proto}://${host}/api/block/${id}`, { cache: 'no-store' })
	}
	const ok = res.ok
	let block: BlockData | null = null
	let dataError: { error?: string } | null = null
	try {
		const parsed = await res.json()
		if (ok) block = parsed as BlockData
		else dataError = parsed as { error?: string }
	} catch { }

	return (
		// PADRÃO 1: Fundo com degradê
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 text-gray-900">
			<div className="max-w-6xl mx-auto px-4 py-12">

				{/* Header Section */}
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 border-b border-gray-200 pb-4">
					<div className="flex items-center gap-3">
						<Link href="/overview" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium">
							<ArrowLeft className="h-4 w-4" />
							<span className="text-sm">Back to Overview</span>
						</Link>
						<h1 className="text-3xl font-bold text-gray-900 ml-4">Block Details</h1>
					</div>
				</div>

				{/* Loading / Error Handling */}
				{!ok && (
					<Card className="bg-white border-red-400 border shadow-sm">
						<CardContent className="p-4">
							<div className="text-red-600 font-medium">Failed to load block: {id}. {dataError?.error || 'This block may not exist.'}</div>
						</CardContent>
					</Card>
				)}

				{/* Content */}
				{ok && block && (
					<div className="space-y-6">

						{/* Status Bar */}
						<div className="flex flex-wrap items-center gap-3">
							<span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded font-semibold text-sm">
								<Hash className="h-4 w-4" /> Block ID: {block.id}
							</span>
							{block.completedAt ? (
								<span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded font-medium text-sm">
									<Clock className="h-4 w-4" /> Completed: {timeAgoStr(block.completedAt)}
								</span>
							) : (
								<span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded font-medium text-sm">
									<Clock className="h-4 w-4" /> Pending
								</span>
							)}
							<span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded font-medium text-sm">
								<Gauge className="h-4 w-4" /> Difficulty: {formatDifficultyPrecise(block.hexRangeStartRaw, block.hexRangeEndRaw)}
							</span>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">

							{/* Block Information (Assignment) */}
							<Card className="col-span-1 md:col-span-2 bg-white border-gray-200 shadow-md">
								<CardHeader className="border-b pb-4">
									<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
										<Hash className="h-5 w-5 text-blue-600" /> Assignment Details
									</CardTitle>
									<CardDescription className="text-gray-600">Details about the assigned key range and pool participant.</CardDescription>
								</CardHeader>
								<CardContent className="pt-4 space-y-3 text-sm">

									<div className="bg-gray-50 border border-gray-200 p-3 rounded-md font-mono text-gray-800 break-all flex items-center justify-between">
										<div>
											{block.hexRangeStart} <ArrowRight className="inline h-3 w-3 mx-1 text-gray-500" /> {block.hexRangeEnd}
										</div>
										<CopyButton text={`${block.hexRangeStart}:${block.hexRangeEnd}`} className="text-xs">Copy Range</CopyButton>
									</div>



									<div className="grid grid-cols-2 gap-4">
										<div>
											<div className="text-xs font-medium text-gray-600">Assigned By (Address)</div>
											<div className="text-sm font-mono text-gray-800">{mask(block.bitcoinAddress)}</div>
										</div>


										<div>
											<div className="text-xs font-medium text-gray-600">Token Mask</div>
											<div className="text-sm font-mono text-gray-800">{block.tokenMasked}</div>
										</div>
										<div>
											<div className="text-xs font-medium text-gray-600">Assigned At</div>
											<div className="text-sm text-gray-800">{new Date(block.assignedAt).toLocaleString()}</div>
										</div>
										<div>
											<div className="text-xs font-medium text-gray-600">Duration</div>
											<div className="text-sm text-gray-800 font-mono">{formatDuration(block.durationSeconds)}</div>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Performance Card */}
							<Card className="bg-white border-gray-200 shadow-md">
								<CardHeader className="border-b pb-4">
									<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
										<Gauge className="h-5 w-5 text-green-600" /> Performance
									</CardTitle>
								</CardHeader>
								<CardContent className="pt-4 space-y-2 text-sm">
									<div className="flex justify-between">
										<span className="text-gray-600">Average Speed:</span>
										<span className="font-mono text-green-700 font-semibold">{formatSpeed(block.avgSpeedKeysPerSec)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-gray-600">Keys Validated:</span>
										<span className="font-mono text-gray-800">{block.keysValidated.toLocaleString()}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-gray-600">Credits Awarded:</span>
										<span className="font-mono text-blue-700">{block.creditsAwarded}</span>
									</div>
								</CardContent>
							</Card>
						</div>

						<Accordion type="multiple" className="bg-white rounded-xl border border-gray-200 shadow-sm">
							<AccordionItem value="cmd">
								<AccordionTrigger className="px-6">
									<span className="flex items-center gap-2 text-lg text-gray-900"><Terminal className="h-5 w-5 text-blue-600" /> Command Line</span>
								</AccordionTrigger>
								<AccordionContent className="px-6">
									<div className="flex items-center justify-between gap-2">
										<div className="font-mono text-sm bg-gray-50 p-3 rounded border border-gray-200 break-all w-full">./vanitysearchXX-v3 -t 0 -gpu -gpuId 0 --keyspace {block.hexRangeStart}:{block.hexRangeEnd} -i in.txt -o out.txt</div>
										<CopyButton text={`./vanitysearchXX-v3 -t 0 -gpu -gpuId 0 --keyspace ${block.hexRangeStart}:${block.hexRangeEnd} -i in.txt -o out.txt`} className="text-xs h-12">Copy</CopyButton>
									</div>
								</AccordionContent>
							</AccordionItem>

							{!block.completedAt && (
								<AccordionItem value="submit">
									<AccordionTrigger className="px-6">
										<span className="flex items-center gap-2 text-lg text-gray-900"><Key className="h-5 w-5 text-rose-600" /> Solution Submission</span>
									</AccordionTrigger>
									<AccordionContent className="px-6">
										<BlockSolutionSubmit blockId={block.id} rangeStart={block.hexRangeStart} rangeEnd={block.hexRangeEnd} checkworkAddresses={block.checkworkAddresses} />
									</AccordionContent>
								</AccordionItem>
							)}
						</Accordion>

						{/* Checkwork & Private Keys (Matched and Unmatched) */}
						<Card className="bg-white border-gray-200 shadow-md">
							<CardHeader className="border-b pb-4">
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
									<Clock className="h-5 w-5 text-purple-600" /> Solution Submission Status
								</CardTitle>
								<CardDescription className="text-gray-600">Validation status of submitted checkwork and private keys.</CardDescription>
								{block.checkworkAddresses && block.checkworkAddresses.length > 0 && (
									<CardAction>
										<CopyButton
											text={block.checkworkAddresses.join('\n')}
											className="text-xs"
										>Copy Addresses</CopyButton>
									</CardAction>
								)}
							</CardHeader>
							<CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">

								{/* Checkwork Addresses (Matched / Pending) */}
								<div>
									<div className="text-sm font-semibold text-gray-800 mb-2">Checkwork Addresses ({block.checkworkAddresses?.length ?? 0})</div>
									<div className="flex flex-wrap gap-2 text-xs mb-3">
										<span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">Matched {block.matchedCount ?? 0}</span>
										<span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Missing {block.missingAddresses?.length ?? 0}</span>
										<span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">Total Keys {block.privateKeys?.length ?? 0}</span>
									</div>
									<div className="space-y-3 h-fit overflow-y-auto pr-2">
										{block.checkworkAddresses && block.checkworkAddresses.length > 0 ? (
											block.checkworkAddresses.map((addr: string, i: number) => {
												const matchedForAddr = (block.addressMap || []).filter((m: { address: string; isValid: boolean }) => m.address === addr && m.isValid)
												const isMatched = matchedForAddr.length > 0

												return (
													<div key={`cw-${i}`} className={`p-2 rounded ${isMatched ? 'bg-green-50 border border-green-300' : 'bg-white border border-gray-200'}`}>
														<div className="flex items-center justify-between">
															<div className="text-xs font-mono text-gray-800 break-all pr-2">{addr}</div>
															<span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${isMatched ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
																{isMatched ? 'MATCHED' : 'PENDING'}
															</span>
														</div>
														{matchedForAddr.map((m: { privateKey?: string; address: string }, j: number) => (
															<div key={`cwpk-${i}-${j}`} className="mt-1 text-[11px] font-mono text-green-700 break-all">
																{m.address}
															</div>
														))}
													</div>
												);
											})
										) : (
											<div className="text-sm text-gray-600">No checkwork addresses submitted for this block.</div>
										)}
									</div>
								</div>

								{/* Unmatched Private Keys */}
								<div>
									<div className="text-sm font-semibold text-gray-800 mb-2">Unmatched Private Keys ({block.privateKeys?.length ?? 0})</div>
									<div className="text-xs text-gray-600 mb-2">Keys that did not match any checkwork address upon submission.</div>
									<div className="space-y-1 max-h-60 overflow-y-auto pr-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
										{(block.addressMap || []).filter((m: { isValid: boolean }) => !m.isValid).map((m: { privateKey?: string; address: string }, i: number) => (
											<div key={`u2-${i}`} className="text-xs font-mono text-gray-800 break-all border-b border-gray-100 pb-1 last:border-b-0">
												{m.privateKey}
											</div>
										))}
										{block.addressMap && block.addressMap.filter((m: { isValid: boolean }) => !m.isValid).length === 0 && (
											<div className="text-xs text-gray-600 text-center py-4">All submitted keys were matched or deemed valid.</div>
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				)}
			</div>
		</div>
	)
}
