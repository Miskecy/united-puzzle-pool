'use client'

import React from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Hash, Clock, Key, SquareMousePointer, ArrowLeftRight } from 'lucide-react'
import BlockSolutionSubmit from '@/components/BlockSolutionSubmit'
import CopyButton from '@/components/CopyButton'
import { deriveBitcoinAddressFromPrivateKeyHex } from '@/lib/utils'
import { Button } from './ui/button'

type AddressMapItem = { privateKey?: string; address: string; isValid: boolean }

export default function BlockLiveClient({
	id,
	hexRangeStart,
	hexRangeEnd,
	checkworkAddresses,
	initialAddressMap,
	completedAt,
	puzzleAddress,
}: {
	id: string
	hexRangeStart: string
	hexRangeEnd: string
	checkworkAddresses: string[]
	initialAddressMap: AddressMapItem[]
	completedAt?: string | null
	puzzleAddress?: string
}) {
	const [liveKeys, setLiveKeys] = React.useState<string[]>([])
	const [customTemplate, setCustomTemplate] = React.useState<string>('')
	const [showAddrMap, setShowAddrMap] = React.useState<Record<string, boolean>>({})

	const cwSet = React.useMemo(() => new Set(checkworkAddresses || []), [checkworkAddresses])
	const liveDerived = React.useMemo(() => {
		const out: Array<{ key: string; address: string }> = []
		for (const k of liveKeys) {
			const addr = deriveBitcoinAddressFromPrivateKeyHex(k)
			out.push({ key: k, address: addr })
		}
		return out
	}, [liveKeys])

	const puzzleAddrSet = React.useMemo(() => new Set([puzzleAddress].filter(a => typeof a === 'string').map(a => String(a).trim()).filter(a => a.length > 0)), [puzzleAddress])

	const unmatchedDerived = React.useMemo(() => {
		return liveDerived.filter(d => !cwSet.has(d.address))
	}, [liveDerived, cwSet])

	function toggleShow(key: string) {
		setShowAddrMap(prev => ({ ...prev, [key]: !prev[key] }))
	}

	React.useEffect(() => {
		try {
			const saved = typeof window !== 'undefined' ? localStorage.getItem('pool-custom-command') : null
			if (saved) setCustomTemplate(saved)
		} catch { }
	}, [])

	// Puzzle address is provided via props; no need to fetch

	const cmdText = React.useMemo(() => {
		const def = `./vanitysearchXX-v3 -t 0 -gpu -gpuId 0 --keyspace ${hexRangeStart.replace('0x', '')}:${hexRangeEnd.replace('0x', '')} -i in.txt -o out.txt`
		let tpl = customTemplate || def
		tpl = tpl.replaceAll('${hexRangeStart}', hexRangeStart)
		tpl = tpl.replaceAll('${hexRangeEnd}', hexRangeEnd)
		tpl = tpl.replaceAll('{hexRangeStart}', hexRangeStart)
		tpl = tpl.replaceAll('{hexRangeEnd}', hexRangeEnd)
		function applyRangeToKeyspace(s: string, start: string, end: string): string {
			let out = s
			const val = `${start}:${end}`
			out = out.replace(/--keyspace\s*=\s*\"[^\"]*\"/i, `--keyspace="${val}"`)
			out = out.replace(/--keyspace\s*=\s*\'[^\']*\'/i, `--keyspace='${val}'`)
			out = out.replace(/--keyspace\s*=\s*[^\s\"']+/i, `--keyspace=${val}`)
			out = out.replace(/--keyspace\s+[^\s\"']+/i, `--keyspace ${val}`)
			return out
		}
		tpl = applyRangeToKeyspace(tpl, hexRangeStart.replace('0x', ''), hexRangeEnd.replace('0x', ''))
		return tpl
	}, [customTemplate, hexRangeStart, hexRangeEnd])

	function handleSetCustom() {
		const def = `./vanitysearchXX-v3 -t 0 -gpu -gpuId 0 --keyspace ${hexRangeStart.replace('0x', '')}:${hexRangeEnd.replace('0x', '')} -i in.txt -o out.txt`
		const current = customTemplate || def
		const input = typeof window !== 'undefined' ? window.prompt('Enter custom command template', current) : null
		if (input && input.trim().length > 0) {
			setCustomTemplate(input)
			try { localStorage.setItem('pool-custom-command', input) } catch { }
		}
	}

	return (
		<div className="space-y-6">
			{!completedAt && (
				<Accordion type="multiple" className="bg-white rounded-xl border border-gray-200 shadow-sm">

					<AccordionItem value="cmd">
						<AccordionTrigger className="px-6">
							<span className="flex items-center gap-2 text-lg text-gray-900"><Hash className="h-5 w-5 text-blue-600" /> Command Line</span>
						</AccordionTrigger>
						<AccordionContent className="px-6">
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center h-26 font-mono text-sm bg-gray-50 p-3 rounded border border-gray-200 break-all w-full">{cmdText}</div>
								<div className='flex flex-col gap-2'>
									<CopyButton text={cmdText} className="text-xs h-12">Copy</CopyButton>
									<Button className="text-xs h-12" onClick={handleSetCustom}><SquareMousePointer className="h-5 w-5" /> Custom</Button>
								</div>
							</div>
						</AccordionContent>
					</AccordionItem>

					<AccordionItem value="submit">
						<AccordionTrigger className="px-6">
							<span className="flex items-center gap-2 text-lg text-gray-900"><Key className="h-5 w-5 text-rose-600" /> Solution Submission</span>
						</AccordionTrigger>
						<AccordionContent className="px-6">
							<BlockSolutionSubmit blockId={id} onParsedKeysChange={setLiveKeys} puzzleAddress={puzzleAddress} />
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			)}

			<Card className="bg-white border-gray-200 shadow-md">
				<CardHeader className="border-b pb-4">
					<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
						<Clock className="h-5 w-5 text-purple-600" /> Solution Submission Status
					</CardTitle>
					<CardDescription className="text-gray-600">Validation status of submitted checkwork and private keys.</CardDescription>
					{(!completedAt && checkworkAddresses && checkworkAddresses.length > 0) && (
						<CardAction>
							<CopyButton text={checkworkAddresses.join('\n')} className="text-xs">Copy Addresses</CopyButton>
						</CardAction>
					)}
				</CardHeader>
				<CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<div className="text-sm font-semibold text-gray-800 mb-2">Checkwork Addresses ({checkworkAddresses?.length ?? 0})</div>
						<div className="flex flex-wrap gap-2 text-xs mb-3">
							<span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">Matched {initialAddressMap.filter(m => m.isValid).length + liveDerived.filter(d => cwSet.has(d.address)).length}</span>
							<span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Missing {checkworkAddresses.filter(a => !(initialAddressMap.some(m => m.address === a && m.isValid) || liveDerived.some(d => d.address === a))).length}</span>
							<span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">Total Keys {(initialAddressMap || []).length}</span>
						</div>
						<div className="space-y-3 h-fit overflow-y-auto pr-2">
							{checkworkAddresses && checkworkAddresses.length > 0 ? (
								checkworkAddresses.map((addr: string, i: number) => {
									const matchedExisting = (initialAddressMap || []).filter(m => m.address === addr && m.isValid)
									const matchedLive = liveDerived.filter(d => d.address === addr)
									const isMatched = matchedExisting.length > 0 || matchedLive.length > 0
									return (
										<div key={`cw-${i}`} className={`p-2 rounded ${isMatched ? 'bg-green-50 border border-green-300' : 'bg-white border border-gray-200'}`}>
											<div className="flex items-center justify-between">
												<div className="text-xs font-mono text-gray-800 break-all pr-2">{addr}</div>
												<span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${isMatched ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{isMatched ? 'MATCHED' : 'PENDING'}</span>
											</div>
											{[...matchedExisting.map(m => m.privateKey).filter(Boolean) as string[], ...matchedLive.map(m => m.key)].map((pk, j) => (
												<div key={`cwpk-${i}-${j}`} className="mt-1 text-[11px] font-mono text-green-700 break-all">{pk}</div>
											))}
										</div>
									)
								})
							) : (
								<div className="text-sm text-gray-600">No checkwork addresses submitted for this block.</div>
							)}
						</div>
					</div>
					<div>
						<div className="text-sm font-semibold text-gray-800 mb-2">Unmatched Private Keys ({unmatchedDerived.length})</div>
						<div className="text-xs text-gray-600 mb-2">Keys that did not match any checkwork address upon submission.</div>
						<div className="space-y-1 max-h-[500px] overflow-y-auto pr-2  flex-1 p-2 rounded-lg ">
							{unmatchedDerived.map((d, i) => {
								const isPuzzle = puzzleAddrSet.has(d.address)
								const showAddr = !!showAddrMap[d.key]
								return (
									<div key={`u2-${i}`} className={`flex items-center justify-between gap-2 text-xs font-mono break-all border p-2 rounded-md border-gray-200 ${isPuzzle ? 'text-green-700' : 'text-gray-800'}`}>
										<span className="break-all">{showAddr ? d.address : d.key}</span>
										<button type="button" onClick={() => toggleShow(d.key)} className="shrink-0 text-gray-500 hover:text-gray-700">
											<ArrowLeftRight className="h-4 w-4" />
										</button>
									</div>
								)
							})}
							{unmatchedDerived.length === 0 && (
								<div className="text-xs text-gray-600 text-center py-4">All submitted keys were matched or deemed valid.</div>
							)}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
