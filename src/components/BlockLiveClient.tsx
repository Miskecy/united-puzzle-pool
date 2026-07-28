'use client'

import React from 'react'
import { Hash, Clock, Key, SquareMousePointer, ArrowLeftRight, ChevronDown } from 'lucide-react'
import BlockSolutionSubmit from '@/components/BlockSolutionSubmit'
import CopyButton from '@/components/CopyButton'
import { deriveBitcoinAddressFromPrivateKeyHex } from '@/lib/utils'
import { useTranslation } from '@/contexts/LanguageContext'

type AddressMapItem = { privateKey?: string; address: string; isValid: boolean }

function Accordion({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
	const [open, setOpen] = React.useState(false)
	return (
		<div style={{ borderBottom: '1px solid #262624' }}>
			<button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-6 py-4 text-left" style={{ color: '#f4f3ee' }}>
				<span className="flex items-center gap-2 text-[15px] font-semibold">{icon}{label}</span>
				<ChevronDown className="h-4 w-4 shrink-0 transition-transform" style={{ color: '#5c5a55', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
			</button>
			{open && <div className="px-6 pb-5">{children}</div>}
		</div>
	)
}

export default function BlockLiveClient({ id, hexRangeStart, hexRangeEnd, checkworkAddresses, initialAddressMap, completedAt, puzzleAddress }: {
	id: string; hexRangeStart: string; hexRangeEnd: string; checkworkAddresses: string[]
	initialAddressMap: AddressMapItem[]; completedAt?: string | null; puzzleAddress?: string
}) {
	const { t } = useTranslation()
	const [liveKeys, setLiveKeys] = React.useState<string[]>([])
	const [customTemplate, setCustomTemplate] = React.useState<string>('')
	const [showAddrMap, setShowAddrMap] = React.useState<Record<string, boolean>>({})

	const cwSet = React.useMemo(() => new Set(checkworkAddresses || []), [checkworkAddresses])
	const liveDerived = React.useMemo(() => liveKeys.map(k => ({ key: k, address: deriveBitcoinAddressFromPrivateKeyHex(k) })), [liveKeys])
	const puzzleAddrSet = React.useMemo(() => new Set([puzzleAddress].filter(a => typeof a === 'string').map(a => String(a).trim()).filter(a => a.length > 0)), [puzzleAddress])
	const unmatchedDerived = React.useMemo(() => liveDerived.filter(d => !cwSet.has(d.address)), [liveDerived, cwSet])

	function toggleShow(key: string) { setShowAddrMap(prev => ({ ...prev, [key]: !prev[key] })) }

	React.useEffect(() => {
		try { const s = typeof window !== 'undefined' ? localStorage.getItem('pool-custom-command') : null; if (s) setCustomTemplate(s) } catch { }
	}, [])

	const cmdText = React.useMemo(() => {
		const def = `./vanitysearchXX-v3 -t 0 -gpu -gpuId 0 --keyspace ${hexRangeStart.replace('0x', '')}:${hexRangeEnd.replace('0x', '')} -i in.txt -o out.txt`
		let tpl = customTemplate || def
		tpl = tpl.replaceAll('${hexRangeStart}', hexRangeStart).replaceAll('${hexRangeEnd}', hexRangeEnd).replaceAll('{hexRangeStart}', hexRangeStart).replaceAll('{hexRangeEnd}', hexRangeEnd)
		const applyRange = (s: string, start: string, end: string) => {
			const val = `${start}:${end}`
			return s.replace(/--keyspace\s*=\s*"[^"]*"/i, `--keyspace="${val}"`).replace(/--keyspace\s*=\s*'[^']*'/i, `--keyspace='${val}'`).replace(/--keyspace\s*=\s*[^\s"']+/i, `--keyspace=${val}`).replace(/--keyspace\s+[^\s"']+/i, `--keyspace ${val}`)
		}
		return applyRange(tpl, hexRangeStart.replace('0x', ''), hexRangeEnd.replace('0x', ''))
	}, [customTemplate, hexRangeStart, hexRangeEnd])

	function handleSetCustom() {
		const def = `./vanitysearchXX-v3 -t 0 -gpu -gpuId 0 --keyspace ${hexRangeStart.replace('0x', '')}:${hexRangeEnd.replace('0x', '')} -i in.txt -o out.txt`
		const input = typeof window !== 'undefined' ? window.prompt('Enter custom command template', customTemplate || def) : null
		if (input && input.trim().length > 0) { setCustomTemplate(input); try { localStorage.setItem('pool-custom-command', input) } catch { } }
	}

	return (
		<div className="space-y-5">
			{!completedAt && (
				<div className="volt-card overflow-hidden">
					<Accordion label={t('blockLive.commandLine')} icon={<Hash className="h-4 w-4" style={{ color: '#fc5c04' }} />}>
						<div className="flex items-center justify-between gap-3">
							<div className="font-mono text-[12px] p-3 rounded-[10px] break-all flex-1" style={{ background: '#131313', border: '1px solid #262624', color: '#f4f3ee', minHeight: 56 }}>{cmdText}</div>
							<div className="flex flex-col gap-2 shrink-0">
								<CopyButton text={cmdText} className="volt-btn-ghost text-[12px] h-10 px-3">{t('common.copy')}</CopyButton>
								<button className="volt-btn-ghost text-[12px] h-10 px-3 flex items-center gap-1" onClick={handleSetCustom}>
									<SquareMousePointer className="h-4 w-4" /> Custom
								</button>
							</div>
						</div>
					</Accordion>
					<Accordion label={t('blockLive.solutionSubmission')} icon={<Key className="h-4 w-4" style={{ color: '#fc5c04' }} />}>
						<BlockSolutionSubmit blockId={id} onParsedKeysChange={setLiveKeys} puzzleAddress={puzzleAddress} />
					</Accordion>
				</div>
			)}

			<div className="volt-card">
				<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
					<div>
						<div className="flex items-center gap-2">
							<Clock className="h-4 w-4" style={{ color: '#fc5c04' }} />
							<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('blockLive.submissionStatus')}</span>
						</div>
						<p className="text-[12.5px] mt-1" style={{ color: '#5c5a55' }}>{t('blockLive.submissionDesc')}</p>
					</div>
					{!completedAt && checkworkAddresses?.length > 0 && (
						<CopyButton text={checkworkAddresses.join('\n')} className="volt-btn-ghost text-[12px]">{t('blockLive.copyAddresses')}</CopyButton>
					)}
				</div>
				<div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
					{/* Checkwork */}
					<div>
						<div className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>
							{t('blockLive.checkworkAddresses')} ({checkworkAddresses?.length ?? 0})
						</div>
						<div className="flex flex-wrap gap-2 text-[11.5px] mb-3">
							<span className="volt-badge-success">{t('blockLive.matched')} {initialAddressMap.filter(m => m.isValid).length + liveDerived.filter(d => cwSet.has(d.address)).length}</span>
							<span className="volt-badge-neutral">{t('blockLive.missing')} {checkworkAddresses.filter(a => !(initialAddressMap.some(m => m.address === a && m.isValid) || liveDerived.some(d => d.address === a))).length}</span>
							<span className="volt-badge-neutral">{t('blockLive.totalKeys')} {(initialAddressMap || []).length}</span>
						</div>
						<div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 400 }}>
							{checkworkAddresses?.length > 0 ? checkworkAddresses.map((addr, i) => {
								const matchedExisting = (initialAddressMap || []).filter(m => m.address === addr && m.isValid)
								const matchedLive = liveDerived.filter(d => d.address === addr)
								const isMatched = matchedExisting.length > 0 || matchedLive.length > 0
								return (
									<div key={`cw-${i}`} className="p-2 rounded-xl" style={{ background: isMatched ? '#123420' : '#131313', border: `1px solid ${isMatched ? 'rgba(61,220,132,0.3)' : '#262624'}` }}>
										<div className="flex items-center justify-between gap-2">
											<code className="text-[11px] font-mono break-all pr-2" style={{ color: '#9a9892' }}>{addr}</code>
											<span className={isMatched ? 'volt-badge-success shrink-0' : 'volt-badge-neutral shrink-0'}>{isMatched ? t('blockLive.matchedBadge') : t('blockLive.pendingBadge')}</span>
										</div>
										{[...matchedExisting.map(m => m.privateKey).filter(Boolean) as string[], ...matchedLive.map(m => m.key)].map((pk, j) => (
											<div key={`cwpk-${i}-${j}`} className="mt-1 text-[10.5px] font-mono break-all" style={{ color: '#3ddc84' }}>{pk}</div>
										))}
									</div>
								)
							}) : <div className="text-[13px]" style={{ color: '#5c5a55' }}>{t('blockLive.noCwAddresses')}</div>}
						</div>
					</div>

					{/* Unmatched keys */}
					<div>
						<div className="text-[13px] font-semibold mb-1" style={{ color: '#f4f3ee' }}>{t('blockLive.unmatchedKeys')} ({unmatchedDerived.length})</div>
						<p className="text-[12px] mb-2" style={{ color: '#5c5a55' }}>{t('blockLive.unmatchedKeysDesc')}</p>
						<div className="space-y-1 overflow-y-auto pr-1 rounded-[10px] p-2" style={{ maxHeight: 400, background: '#131313', border: '1px solid #262624' }}>
							{unmatchedDerived.map((d, i) => {
								const isPuzzle = puzzleAddrSet.has(d.address)
								return (
									<div key={`u2-${i}`} className="flex items-center justify-between gap-2 text-[11.5px] font-mono break-all p-2 rounded-[6px]" style={{ border: '1px solid #262624', color: isPuzzle ? '#3ddc84' : '#9a9892' }}>
										<span className="break-all">{showAddrMap[d.key] ? d.address : d.key}</span>
										<button type="button" onClick={() => toggleShow(d.key)} className="shrink-0" style={{ color: '#5c5a55' }}>
											<ArrowLeftRight className="h-4 w-4" />
										</button>
									</div>
								)
							})}
							{unmatchedDerived.length === 0 && <div className="text-[12.5px] text-center py-4" style={{ color: '#5c5a55' }}>{t('blockLive.allMatched')}</div>}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
