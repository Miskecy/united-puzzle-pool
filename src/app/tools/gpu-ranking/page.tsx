'use client'

import { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GpuIcon, ChevronDown, ChevronUp, Filter, Award, Zap, Activity, Battery, Search, Scale, BarChart3, ListOrdered } from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis } from 'recharts'
import specsData from '@/data/gpu-specs.json'

type GPUItem = { rank?: number; model: string; cuda_cores: number; architecture: string; series: string; tdp_w: number; approx_keys_per_second_mkeys: number }
type SortKey = 'rank' | 'speed' | 'efficiency' | 'cuda' | 'tdp'
const NF_INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const NF_1DP = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const NF_2DP = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const NF_4DP = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })
function computeEfficiency(item: GPUItem) { const w = Number(item.tdp_w); if (!isFinite(w) || w <= 0) return 0; return item.approx_keys_per_second_mkeys / w }
type Unit = '' | 'K' | 'M' | 'B' | 'T' | 'P' | 'E'
const UNITS: Array<{ label: Unit; factor: bigint }> = [
	{ label: 'E', factor: 1_000_000_000_000_000_000n },
	{ label: 'P', factor: 1_000_000_000_000_000n },
	{ label: 'T', factor: 1_000_000_000_000n },
	{ label: 'B', factor: 1_000_000_000n },
	{ label: 'M', factor: 1_000_000n },
	{ label: 'K', factor: 1_000n },
	{ label: '', factor: 1n },
]
function scaleFromMKeys(mkeys: number, unit: Unit): { intPart: bigint; twoDec: bigint; value: number } {
	const u = UNITS.find(x => x.label === unit) ?? UNITS[UNITS.length - 1]
	const keys = BigInt(Math.round(mkeys)) * 1_000_000n
	const intPart = keys / u.factor
	const rem = keys % u.factor
	const twoDec = (rem * 100n) / u.factor
	const value = Number(intPart) + Number(twoDec) / 100
	return { intPart, twoDec, value }
}
function fmtScaled(intPart: bigint, twoDec: bigint): string {
	if (intPart >= 100n) return NF_INT.format(Number(intPart))
	if (intPart >= 10n) return `${NF_INT.format(Number(intPart))}.${Number(twoDec / 10n).toString().padStart(1, '0')}`
	return `${NF_INT.format(Number(intPart))}.${Number(twoDec).toString().padStart(2, '0')}`
}
function toSpeed(mkeys: number, unit: Unit) { return scaleFromMKeys(mkeys, unit).value }
function toEff(mkeysPerW: number, unit: Unit) { return scaleFromMKeys(mkeysPerW, unit).value }
function fmtSpeed(valMKeys: number, unit: Unit) { const { intPart, twoDec } = scaleFromMKeys(valMKeys, unit); return fmtScaled(intPart, twoDec) }
function fmtEff(valMKeysPerW: number, unit: Unit) { const v = toEff(valMKeysPerW, unit); const decs = v >= 100 ? 0 : v >= 10 ? 1 : 2; return v.toFixed(decs) }
function pickUnitForKeys(mkeysPerW: number): Unit {
	const keys = BigInt(Math.round(mkeysPerW)) * 1_000_000n
	for (const u of UNITS) {
		const intPart = keys / u.factor
		if (intPart >= 1n && intPart < 1000n) return u.label
	}
	return ''
}
function fmtEffAuto(mkeysPerW: number): { text: string; label: string; unit: Unit } {
	const u = pickUnitForKeys(mkeysPerW)
	const v = toEff(mkeysPerW, u)
	const decs = v >= 100 ? 0 : v >= 10 ? 1 : 2
	return { text: v.toFixed(decs), label: `${u ? u : ''}Keys/W`, unit: u }
}
function estimateSpeedMKeys(spec: { architecture: string; cuda_cores: number }) { const a = (spec.architecture || '').toLowerCase(); let f = 0.12; if (a.includes('ada')) f = 0.16; else if (a.includes('ampere')) f = 0.12; else if (a.includes('turing')) f = 0.30; else if (a.includes('rdna 4')) f = 0.14; else if (a.includes('rdna 3')) f = 0.12; else if (a.includes('rdna 2')) f = 0.10; else if (a.includes('rdna')) f = 0.09; else if (a.includes('vega')) f = 0.08; else if (a.includes('blackwell')) f = 0.18; const c = Number(spec.cuda_cores || 0); return c * f }
function SortButton({ label, keySel, sortKey, sortDir, onClick }: { label: string; keySel: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc'; onClick: () => void }) { const isActive = sortKey === keySel; return (<Button variant={isActive ? 'default' : 'outline'} size="sm" onClick={onClick} className={`${isActive ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md' : 'border-gray-300 text-gray-700 hover:bg-gray-100'} transition-all font-medium`}>{label}{isActive && (sortDir === 'desc' ? <ChevronDown className="ml-1 w-4 h-4" /> : <ChevronUp className="ml-1 w-4 h-4" />)}</Button>) }

export default function GPURankingPage() {
	const [query, setQuery] = useState('')
	const [arch, setArch] = useState<string>('All')
	const [series, setSeries] = useState<string>('All')
	const [sortKey, setSortKey] = useState<SortKey>('speed')
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
	const [cmpA, setCmpA] = useState<string>('')
	const [cmpB, setCmpB] = useState<string>('')
	const [unit, setUnit] = useState<Unit>('B')
	const speedUnitLabel = `${unit ? unit : ''}Keys/s`
	const effUnitLabel = `${unit ? unit : ''}Keys/W`
	const [userModel, setUserModel] = useState('')
	const [userSpeed, setUserSpeed] = useState<string>('')
	const [userSpeedUnit, setUserSpeedUnit] = useState<Unit>('M')
	const [userMsg, setUserMsg] = useState('')
	const [userLoading, setUserLoading] = useState(false)
	const [userItems, setUserItems] = useState<{ id: string; model: string; approx_keys_per_second_mkeys: number; tdp_w?: number; brand?: string; architecture?: string; series?: string; status: 'PENDING' | 'APPROVED' | 'DENIED' }[]>([])
	const gpuSpecs = useMemo(() => { type SpecRow = { Brand: string; Model: string; Architecture: string; Series: string; CoreUnits: number; TDP_W: number | null; approx_keys_per_second_mkeys?: number }; const rows: SpecRow[] = Array.isArray(specsData) ? (specsData as SpecRow[]) : []; const map = new Map<string, { brand: string; model: string; architecture: string; series: string; cuda_cores: number; tdp_w: number; approx_keys_per_second_mkeys: number }>(); for (const s of rows) { map.set(s.Model, { brand: s.Brand, model: s.Model, architecture: s.Architecture, series: s.Series, cuda_cores: Number(s.CoreUnits || 0), tdp_w: Number.isFinite(Number(s.TDP_W)) ? Number(s.TDP_W) : 0, approx_keys_per_second_mkeys: Number(s.approx_keys_per_second_mkeys || 0), }) } return map }, [])
	const userAggregated = useMemo(() => { const byModel = new Map<string, { model: string; speeds: number[]; brand?: string; architecture?: string; series?: string; tdp_w?: number }>(); for (const it of userItems.filter(i => i.status === 'APPROVED')) { const cur = byModel.get(it.model) || { model: it.model, speeds: [], brand: it.brand, architecture: it.architecture, series: it.series, tdp_w: it.tdp_w }; cur.speeds.push(it.approx_keys_per_second_mkeys); byModel.set(it.model, cur) } const rows = Array.from(byModel.values()).map(v => { const avg = v.speeds.length ? (v.speeds.reduce((a, b) => a + b, 0) / v.speeds.length) : 0; const spec = gpuSpecs.get(v.model); return { model: v.model, approx_keys_per_second_mkeys: avg, architecture: spec?.architecture ?? v.architecture ?? '-', series: spec?.series ?? v.series ?? '-', cuda_cores: spec?.cuda_cores ?? 0, tdp_w: spec?.tdp_w ?? v.tdp_w ?? 0, brand: spec?.brand ?? v.brand ?? '-', } }); return rows.sort((a, b) => b.approx_keys_per_second_mkeys - a.approx_keys_per_second_mkeys) }, [userItems, gpuSpecs])
	const userSpeedMax = useMemo(() => { return userAggregated.length ? Math.max(...userAggregated.map(d => d.approx_keys_per_second_mkeys)) : 0 }, [userAggregated])
	const userEffMax = useMemo(() => { return userAggregated.length ? Math.max(...userAggregated.map(d => computeEfficiency({ model: d.model, cuda_cores: d.cuda_cores, architecture: d.architecture, series: d.series, tdp_w: d.tdp_w ?? 0, approx_keys_per_second_mkeys: d.approx_keys_per_second_mkeys }))) : 0 }, [userAggregated])
	const data = useMemo(() => { const list = Array.from(gpuSpecs.values()).map(s => { return { model: s.model, cuda_cores: s.cuda_cores, architecture: s.architecture, series: s.series, tdp_w: s.tdp_w, approx_keys_per_second_mkeys: s.approx_keys_per_second_mkeys } }); const ranked = list.slice().sort((a, b) => b.approx_keys_per_second_mkeys - a.approx_keys_per_second_mkeys).map((it, idx) => ({ ...it, rank: idx + 1 })); return ranked }, [gpuSpecs])
	async function fetchUserGpus() { try { const r = await fetch('/api/user-gpus'); if (r.ok) { const j = await r.json(); setUserItems(Array.isArray(j.items) ? j.items : []) } } catch { } }
	useEffect(() => { fetchUserGpus() }, [])
	const architectures = useMemo(() => { const set = new Set<string>(); for (const d of data) set.add(d.architecture); return ['All', ...Array.from(set)] }, [data])
	const seriesList = useMemo(() => { const set = new Set<string>(); for (const d of data) set.add(d.series); return ['All', ...Array.from(set)] }, [data])
	const models = useMemo(() => { const set = new Set<string>(); for (const d of data) set.add(d.model); return Array.from(set).sort((a, b) => a.localeCompare(b)) }, [data])
	const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return data.filter(d => { if (arch !== 'All' && d.architecture !== arch) return false; if (series !== 'All' && d.series !== series) return false; if (!q) return true; return (d.model.toLowerCase().includes(q) || d.architecture.toLowerCase().includes(q) || d.series.toLowerCase().includes(q)) }) }, [data, query, arch, series])
	const sorted = useMemo(() => { const arr = filtered.slice(); arr.sort((a, b) => { let av = 0; let bv = 0; switch (sortKey) { case 'rank': av = a.rank ?? 0; bv = b.rank ?? 0; break; case 'speed': av = a.approx_keys_per_second_mkeys; bv = b.approx_keys_per_second_mkeys; break; case 'efficiency': av = computeEfficiency(a); bv = computeEfficiency(b); break; case 'cuda': av = a.cuda_cores; bv = b.cuda_cores; break; case 'tdp': av = a.tdp_w; bv = b.tdp_w; break; } return sortDir === 'asc' ? av - bv : bv - av }); return arr }, [filtered, sortKey, sortDir])
	const top10Speed = useMemo(() => { return data.slice().sort((a, b) => b.approx_keys_per_second_mkeys - a.approx_keys_per_second_mkeys).slice(0, 10) }, [data])
	const speedMax = useMemo(() => { return filtered.length ? Math.max(...filtered.map(d => d.approx_keys_per_second_mkeys)) : 0 }, [filtered])
	const effMax = useMemo(() => { return filtered.length ? Math.max(...filtered.map(d => computeEfficiency(d))) : 0 }, [filtered])
	const top = sorted[0]
	const median = sorted[Math.floor(sorted.length / 2)]
	const avgSpeed = useMemo(() => { if (!sorted.length) return 0; const sum = sorted.reduce((acc, it) => acc + it.approx_keys_per_second_mkeys, 0); return sum / sorted.length }, [sorted])
	const itemA = useMemo(() => data.find(d => d.model === cmpA), [data, cmpA])
	const itemB = useMemo(() => data.find(d => d.model === cmpB), [data, cmpB])
	const pct = (a: number, b: number) => { if (!isFinite(a) || !isFinite(b) || b === 0) return 0; return ((a - b) / b) * 100 }
	const betterClass = (cond: boolean, neutralColor: string = 'text-gray-900') => cond ? 'text-blue-600' : neutralColor
	const changeSort = (key: SortKey) => { if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(key); setSortDir('desc') } }
	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
				<div className="text-center mb-16">
					<div className="flex justify-center mb-6">
						<div className="p-4 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
							<GpuIcon className="w-12 h-12 text-white" />
						</div>
					</div>
					<h1 className="text-5xl font-extrabold text-gray-900 mb-3">GPU Ranking Dashboard</h1>
					<p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">Top 50 GPUs for brute force, with clear Speed and Efficiency metrics.</p>
				</div>
				<Tabs defaultValue="official" className="w-full">
					<TabsList className="grid w-full grid-cols-2 h-auto p-1 mb-6 bg-white shadow-md border border-gray-200">
						<TabsTrigger value="official" className="text-sm py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-wrap">GPU Ranking</TabsTrigger>
						<TabsTrigger value="user" className="text-sm py-2 px-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg">User GPU Table</TabsTrigger>
					</TabsList>
					<TabsContent value="official" className="space-y-6">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
							<Card className="shadow-md border border-gray-200 bg-white hover:shadow-lg transition-shadow">
								<CardHeader className="border-b px-6 py-4">
									<CardTitle className="text-xl font-semibold text-gray-800 flex items-center gap-2">
										<Zap className="w-5 h-5 text-blue-600" /> Fastest
									</CardTitle>
									<CardDescription className="text-gray-500">Top Speed in {speedUnitLabel}</CardDescription>
								</CardHeader>
								<CardContent className="pt-6 px-6 pb-6">
									{top ? (
										<div className="flex items-center justify-between">
											<div>
												<div className="text-4xl font-extrabold text-blue-600">{fmtSpeed(top.approx_keys_per_second_mkeys, unit)}</div>
												<div className="text-sm text-gray-700 mt-1 font-medium">{top.model}</div>
											</div>
											<Badge className="bg-gray-200 text-gray-800 border border-gray-300">{top.architecture}</Badge>
										</div>
									) : <div className="text-sm text-gray-600">No Data</div>}
								</CardContent>
							</Card>
							<Card className="shadow-md border border-gray-200 bg-white hover:shadow-lg transition-shadow">
								<CardHeader className="border-b px-6 py-4">
									<CardTitle className="text-xl font-semibold text-gray-800 flex items-center gap-2">
										<Activity className="w-5 h-5 text-gray-600" /> Average Speed
									</CardTitle>
									<CardDescription className="text-gray-500">Across filtered items</CardDescription>
								</CardHeader>
								<CardContent className="pt-6 px-6 pb-6">
									<div className="text-4xl font-extrabold text-gray-900">{fmtSpeed(avgSpeed, unit)}</div>
									<div className="text-sm text-gray-700 mt-1 font-medium">{speedUnitLabel}</div>
								</CardContent>
							</Card>
							<Card className="shadow-md border border-gray-200 bg-white hover:shadow-lg transition-shadow">
								<CardHeader className="border-b px-6 py-4">
									<CardTitle className="text-xl font-semibold text-gray-800 flex items-center gap-2">
										<ListOrdered className="w-5 h-5 text-gray-600" /> Median Performer
									</CardTitle>
									<CardDescription className="text-gray-500">Representative of the set</CardDescription>
								</CardHeader>
								<CardContent className="pt-6 px-6 pb-6">
									{median ? (
										<div className="flex items-center justify-between">
											<div>
												<div className="text-4xl font-extrabold text-gray-900">{fmtSpeed(median.approx_keys_per_second_mkeys, unit)}</div>
												<div className="text-sm text-gray-700 mt-1 font-medium">{median.model}</div>
											</div>
											<Badge variant="outline" className="border-gray-300 text-gray-600">{median.series}</Badge>
										</div>
									) : <div className="text-sm text-gray-600">No Data</div>}
								</CardContent>
							</Card>
						</div>
						<Card className="mb-10 shadow-lg border border-gray-200 bg-white">
							<CardHeader className="border-b px-6 py-4 ">
								<CardTitle className="text-xl font-semibold text-gray-800 flex items-center gap-2"><Scale className="w-5 h-5 text-blue-600" />Compare GPUs</CardTitle>
								<CardDescription className="text-gray-600">Select two models to view their performance differences.</CardDescription>
							</CardHeader>
							<CardContent className="pt-6 px-6 pb-6">
								<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
									<div className="flex flex-col gap-4">
										<select value={cmpA} onChange={e => setCmpA(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-white text-sm font-medium">
											<option value="">Select GPU A</option>
											{models.map(m => (<option key={`a-${m}`} value={m}>{m}</option>))}
										</select>
										<select value={cmpB} onChange={e => setCmpB(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-white text-sm font-medium">
											<option value="">Select GPU B</option>
											{models.map(m => (<option key={`b-${m}`} value={m}>{m}</option>))}
										</select>
									</div>
									<div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
										<div className="rounded-xl border border-blue-300 p-4 bg-blue-50/50">
											<div className="font-bold text-gray-900 text-lg mb-1">{itemA?.model || 'GPU A'}</div>
											<div className="mt-3 grid grid-cols-2 gap-2 text-sm">
												<div className="flex flex-col gap-0.5"><div className="flex items-center gap-1"><Zap className="w-4 h-4 text-blue-600" /><span className="font-medium text-gray-700">Speed ({speedUnitLabel})</span></div><span className={`text-xl font-bold ${itemA && itemB ? betterClass((itemA.approx_keys_per_second_mkeys) >= (itemB.approx_keys_per_second_mkeys)) : 'text-gray-900'}`}>{itemA ? fmtSpeed(itemA.approx_keys_per_second_mkeys, unit) : '-'}</span></div>
												<div className="flex flex-col gap-0.5"><div className="flex items-center gap-1"><Activity className="w-4 h-4 text-blue-600" /><span className="font-medium text-gray-700">Efficiency ({effUnitLabel})</span></div><span className={`text-xl font-bold ${itemA && itemB ? betterClass(computeEfficiency(itemA) >= computeEfficiency(itemB)) : 'text-gray-900'}`}>{itemA ? fmtEff(computeEfficiency(itemA), unit) : '-'}</span></div>
												<div className="flex flex-col gap-0.5"><div className="flex items-center gap-1"><GpuIcon className="w-4 h-4 text-gray-600" /><span className="font-medium text-gray-700">CUDA</span></div><span className="text-lg font-bold text-gray-900">{itemA ? NF_INT.format(itemA.cuda_cores) : '-'}</span></div>
												<div className="flex flex-col gap-0.5"><div className="flex items-center gap-1"><Battery className="w-4 h-4 text-gray-600" /><span className="font-medium text-gray-700">TDP</span></div><span className={`text-lg font-bold ${itemA && itemB ? betterClass(itemA.tdp_w <= (itemB.tdp_w || 0), 'text-red-600') : 'text-gray-900'}`}>{itemA ? NF_INT.format(itemA.tdp_w) : '-'}</span></div>
											</div>
										</div>
										<div className="rounded-xl border border-gray-300 p-4 bg-gray-100/50">
											<div className="font-bold text-gray-900 text-lg mb-1">{itemB?.model || 'GPU B'}</div>
											<div className="mt-3 grid grid-cols-2 gap-2 text-sm">
												<div className="flex flex-col gap-0.5"><div className="flex items-center gap-1"><Zap className="w-4 h-4 text-blue-600" /><span className="font-medium text-gray-700">Speed ({speedUnitLabel})</span></div><span className={`text-xl font-bold ${itemA && itemB ? betterClass((itemB.approx_keys_per_second_mkeys) >= (itemA.approx_keys_per_second_mkeys)) : 'text-gray-900'}`}>{itemB ? fmtSpeed(itemB.approx_keys_per_second_mkeys, unit) : '-'}</span></div>
												<div className="flex flex-col gap-0.5"><div className="flex items-center gap-1"><Activity className="w-4 h-4 text-blue-600" /><span className="font-medium text-gray-700">Efficiency ({effUnitLabel})</span></div><span className={`text-xl font-bold ${itemA && itemB ? betterClass(computeEfficiency(itemB) >= computeEfficiency(itemA)) : 'text-gray-900'}`}>{itemB ? fmtEff(computeEfficiency(itemB), unit) : '-'}</span></div>
												<div className="flex flex-col gap-0.5"><div className="flex items-center gap-1"><GpuIcon className="w-4 h-4 text-gray-600" /><span className="font-medium text-gray-700">CUDA</span></div><span className="text-lg font-bold text-gray-900">{itemB ? NF_INT.format(itemB.cuda_cores) : '-'}</span></div>
												<div className="flex flex-col gap-0.5"><div className="flex items-center gap-1"><Battery className="w-4 h-4 text-gray-600" /><span className="font-medium text-gray-700">TDP</span></div><span className={`text-lg font-bold ${itemA && itemB ? betterClass(itemB.tdp_w <= (itemA?.tdp_w || 0), 'text-red-600') : 'text-gray-900'}`}>{itemB ? NF_INT.format(itemB.tdp_w) : '-'}</span></div>
											</div>
										</div>
									</div>
									{itemA && itemB && (
										<div className="mt-6 rounded-lg border border-gray-300 p-4 bg-gray-50 text-sm">
											<div className="flex flex-wrap gap-3">
												<span className={`px-3 py-1 rounded-md border text-xs font-semibold ${pct(itemA.approx_keys_per_second_mkeys, itemB.approx_keys_per_second_mkeys) >= 0 ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-red-100 border-red-300 text-red-700'}`}>{NF_1DP.format(pct(itemA.approx_keys_per_second_mkeys, itemB.approx_keys_per_second_mkeys))}% Speed difference (vs B, {speedUnitLabel})</span>
												<span className={`px-3 py-1 rounded-md border text-xs font-semibold ${pct(computeEfficiency(itemA), computeEfficiency(itemB)) >= 0 ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-red-100 border-red-300 text-red-700'}`}>{NF_1DP.format(pct(computeEfficiency(itemA), computeEfficiency(itemB)))}% Efficiency difference (vs B)</span>
												<span className={`px-3 py-1 rounded-md border text-xs font-semibold ${pct(itemA.tdp_w, itemB.tdp_w) <= 0 ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-red-100 border-red-300 text-red-700'}`}>{NF_1DP.format(-pct(itemA.tdp_w, itemB.tdp_w))}% Lower TDP (vs B)</span>
											</div>
										</div>
									)}
									<div className="mt-6 rounded-lg border-2 border-blue-400 bg-blue-50/50 p-4 shadow-md">
										<div className="flex items-center gap-2 text-blue-700 font-bold text-lg"><Award className="w-5 h-5" />Best Recommended Choice</div>
										<div className="mt-2 flex items-center gap-3 text-base text-gray-900 font-semibold">
											<span className="text-blue-600">{(itemA && itemB) ? (computeEfficiency(itemA) >= computeEfficiency(itemB) ? itemA.model : itemB.model) : ''}</span>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card className="mb-10 shadow-lg border border-gray-200 bg-white">
							<CardHeader className="border-b px-6 py-4 ">
								<CardTitle className="text-xl font-semibold text-gray-800 flex items-center gap-2"><Filter className="w-5 h-5 text-blue-600" />Filters & Sorting</CardTitle>
								<CardAction>
									<select value={unit} onChange={e => setUnit((e.target.value as Unit) ?? 'B')} className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm font-medium">
										<option value="E">EKeys/s</option>
										<option value="P">PKeys/s</option>
										<option value="T">TKeys/s</option>
										<option value="B">BKeys/s</option>
										<option value="M">MKeys/s</option>
										<option value="K">KKeys/s</option>
										<option value="">Keys/s</option>
									</select>
								</CardAction>
								<CardDescription className="text-gray-600">Search, filter by architecture or series, and change sorting order.</CardDescription>
							</CardHeader>
							<CardContent className="pt-6 px-6 pb-6">
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div>
										<div className="relative">
											<Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
											<Input placeholder="Search by model, architecture, series" value={query} onChange={e => setQuery(e.target.value)} className="pl-10 h-10 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all text-sm" />
										</div>
									</div>
									<select value={arch} onChange={e => setArch(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-white text-sm font-medium">
										{architectures.map(a => (<option key={`arch-${a}`} value={a}>{a}</option>))}
									</select>
									<select value={series} onChange={e => setSeries(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-white text-sm font-medium">
										{seriesList.map(s => (<option key={`series-${s}`} value={s}>{s}</option>))}
									</select>
								</div>
								<div className="mt-6 flex flex-wrap gap-3 pt-4 border-t border-gray-200">
									<span className="text-base text-gray-700 mr-2 font-semibold self-center">Sort By:</span>
									<SortButton label={`Speed (${speedUnitLabel})`} keySel="speed" sortKey={sortKey} sortDir={sortDir} onClick={() => changeSort('speed')} />
									<SortButton label={`Efficiency (${effUnitLabel})`} keySel="efficiency" sortKey={sortKey} sortDir={sortDir} onClick={() => changeSort('efficiency')} />
									<SortButton label="CUDA Cores" keySel="cuda" sortKey={sortKey} sortDir={sortDir} onClick={() => changeSort('cuda')} />
									<SortButton label="TDP (W)" keySel="tdp" sortKey={sortKey} sortDir={sortDir} onClick={() => changeSort('tdp')} />
									<SortButton label="Rank" keySel="rank" sortKey={sortKey} sortDir={sortDir} onClick={() => changeSort('rank')} />
								</div>
							</CardContent>
						</Card>
						<Card className="shadow-lg border border-gray-200 bg-white">
							<CardHeader className="border-b px-6 py-4 ">
								<CardTitle className="text-xl font-semibold text-gray-800 flex items-center gap-2"><ListOrdered className="w-5 h-5 text-gray-600" />GPU Ranking Table</CardTitle>
								<CardDescription className="text-gray-600">Filtered list of GPUs with comprehensive metrics.</CardDescription>
							</CardHeader>
							<CardContent className="p-0">
								<div className="overflow-x-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10">
											<TableRow className="bg-gray-100 border-b border-gray-300">
												<TableHead className="font-extrabold text-gray-800">#</TableHead>
												<TableHead className="font-extrabold text-gray-800">Model</TableHead>
												<TableHead className="font-extrabold text-gray-800">Architecture</TableHead>
												<TableHead className="font-extrabold text-gray-800">Series</TableHead>
												<TableHead className="font-extrabold text-gray-800 text-right">CUDA Cores</TableHead>
												<TableHead className="font-extrabold text-gray-800 text-right">TDP (W)</TableHead>
												<TableHead className="font-extrabold text-blue-600 text-right">
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<span>Speed ({speedUnitLabel})</span>
															</TooltipTrigger>
															<TooltipContent>Keys per second</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</TableHead>
												<TableHead className="font-extrabold text-blue-600 text-right">
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<span>Efficiency ({effUnitLabel})</span>
															</TooltipTrigger>
															<TooltipContent>Keys per watt</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{sorted.map((it, idx) => (
												<TableRow key={`${it.model}-${it.cuda_cores}`} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} border-b border-gray-200 hover:bg-blue-50/50 transition-colors`}>
													<TableCell className="font-semibold text-gray-900">{it.rank}</TableCell>
													<TableCell>
														<div className="flex items-center gap-2">
															{(it.rank ?? 0) <= 3 && (
																<Award className={`${(it.rank ?? 0) === 1 ? 'text-yellow-500' : (it.rank ?? 0) === 2 ? 'text-gray-400' : 'text-amber-600'} w-4 h-4`} />
															)}
															<div className="font-semibold text-gray-900">{it.model}</div>
														</div>
													</TableCell>
													<TableCell>
														<Badge className="bg-gray-200 text-gray-700 border border-gray-300">{it.architecture}</Badge>
													</TableCell>
													<TableCell>
														<Badge variant="outline" className="border-gray-300 text-gray-600">{it.series}</Badge>
													</TableCell>
													<TableCell className="font-medium text-gray-900 text-right font-mono">{NF_INT.format(it.cuda_cores)}</TableCell>
													<TableCell className="font-medium text-gray-900 text-right font-mono">{NF_INT.format(it.tdp_w)}</TableCell>
													<TableCell className="text-blue-700 font-extrabold text-right">
														<div className="font-mono">{fmtSpeed(it.approx_keys_per_second_mkeys, unit)}</div>
														<div className="mt-1 h-1 bg-blue-100 rounded">
															<div className="h-1 bg-blue-500 rounded" style={{ width: `${speedMax > 0 ? Math.round((it.approx_keys_per_second_mkeys / speedMax) * 100) : 0}%` }} />
														</div>
													</TableCell>
													<TableCell className="text-green-700 font-extrabold text-right">
														<div className="font-mono">{it.tdp_w > 0 ? fmtEff(computeEfficiency(it), unit) : '-'}</div>
														<div className="mt-1 h-1 bg-green-100 rounded">
															<div className="h-1 bg-green-500 rounded" style={{ width: `${effMax > 0 && it.tdp_w > 0 ? Math.round((computeEfficiency(it) / effMax) * 100) : 0}%` }} />
														</div>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</CardContent>
						</Card>
						<Card className="mt-8 shadow-lg border border-gray-200 bg-white">
							<CardHeader className="border-b px-6 py-4 ">
								<CardTitle className="text-xl font-semibold text-gray-800 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-600" />Top 10 Speed Visualization</CardTitle>
								<CardDescription className="text-gray-600">A visual comparison of the ten fastest GPUs.</CardDescription>
							</CardHeader>
							<CardContent className="pt-6 px-6 pb-6">
								<div className="h-80 w-full">
									<ResponsiveContainer width="100%" height="100%">
										<BarChart data={top10Speed.map(d => ({ ...d, u: toSpeed(d.approx_keys_per_second_mkeys, unit) }))} margin={{ left: 20, right: 20, top: 10, bottom: 50 }}>
											<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
											<XAxis dataKey="model" tick={{ fontSize: 12, fill: '#475569' }} interval={0} angle={-25} dy={15} />
											<YAxis tick={{ fontSize: 12, fill: '#475569' }} tickFormatter={(v: number) => {
												if (v >= 100) return NF_INT.format(Math.round(v))
												if (v >= 10) return NF_1DP.format(v)
												return NF_2DP.format(v)
											}} label={{ value: speedUnitLabel, position: 'insideLeft', angle: -90, fill: '#475569' }} />
											<ChartTooltip content={<ChartTooltipContent />} />
											<Bar dataKey="u" fill="#2563eb" radius={[6, 6, 0, 0]} />
										</BarChart>
									</ResponsiveContainer>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
					<TabsContent value="user" className="space-y-6">
						<Card className="shadow-lg border border-gray-200 bg-white">
							<CardHeader className="border-b px-6 py-4 ">
								<CardTitle className="text-xl font-semibold text-gray-800">Submit Your GPU</CardTitle>
								<CardDescription className="text-gray-600">Add your GPU performance. It will appear after admin approval.</CardDescription>
							</CardHeader>
							<CardContent className="pt-6 px-6 pb-6">
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div>
										<label className="text-sm font-medium text-gray-700">Model</label>
										<select value={userModel} onChange={e => setUserModel(e.target.value)} className="mt-1 h-10 px-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-white text-sm font-medium w-full">
											<option value="">Select a GPU</option>
											{models.map(m => (<option key={`user-${m}`} value={m}>{m}</option>))}
										</select>
									</div>
									<div>
										<label className="text-sm font-medium text-gray-700">Speed ({userSpeedUnit ? userSpeedUnit : ''}Keys/s)</label>
										<div className="mt-1 flex gap-2">
											<Input placeholder={(userSpeedUnit === 'M' || userSpeedUnit === '') ? 'e.g. 250000' : 'e.g. 2.5'} value={userSpeed} onChange={e => setUserSpeed(e.target.value)} className="flex-1" />
											<select value={userSpeedUnit} onChange={e => setUserSpeedUnit((e.target.value as Unit) ?? 'M')} className="h-10 px-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-white text-sm font-medium">
												<option value="E">EKeys/s</option>
												<option value="P">PKeys/s</option>
												<option value="T">TKeys/s</option>
												<option value="B">BKeys/s</option>
												<option value="M">MKeys/s</option>
												<option value="K">KKeys/s</option>
												<option value="">Keys/s</option>
											</select>
										</div>
									</div>
									<div className="self-end">
										<Button onClick={async () => {
											if (!userModel.trim() || !isFinite(Number(userSpeed)) || Number(userSpeed) <= 0) { setUserMsg('Enter a valid model and speed'); return }
											setUserLoading(true); setUserMsg('')
											try {
												const spec = gpuSpecs.get(userModel.trim())
												const raw = Number(userSpeed)
												const FACTORS_NUM: Record<Unit, number> = { '': 1, K: 1_000, M: 1_000_000, B: 1_000_000_000, T: 1_000_000_000_000, P: 1_000_000_000_000_000, E: 1_000_000_000_000_000_000 }
												const approxMKeys = raw * (FACTORS_NUM[userSpeedUnit] ?? 1_000_000) / 1_000_000
												const r = await fetch('/api/user-gpus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: userModel.trim(), approx_keys_per_second_mkeys: approxMKeys, brand: spec?.brand, architecture: spec?.architecture, series: spec?.series, tdp_w: spec?.tdp_w }) })
												const j = await r.json().catch(() => ({}))
												if (!r.ok) { setUserMsg(String(j?.error || 'Failed to submit')); return }
												setUserMsg('Submission success — pending admin approval')
												setUserModel('')
												setUserSpeed('')
												await fetchUserGpus()
											} catch { setUserMsg('Failed to submit') } finally { setUserLoading(false) }
										}} disabled={userLoading} className="bg-blue-600 hover:bg-blue-700 text-white">Submit</Button>
									</div>
								</div>
								{userMsg && <div className={`mt-3 text-sm font-medium ${userMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{userMsg}</div>}
							</CardContent>
						</Card>
						<Card className="shadow-lg border border-gray-200 bg-white">
							<CardHeader className="border-b px-6 py-4 ">
								<CardTitle className="text-xl font-semibold text-gray-800">User GPU Table</CardTitle>
								<CardDescription className="text-gray-600">Community GPU performance (approved submissions).</CardDescription>
							</CardHeader>
							<CardContent className="p-0">
								<div className="overflow-x-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10">
											<TableRow className="bg-gray-100 border-b border-gray-300">
												<TableHead className="font-extrabold text-gray-800">Model</TableHead>
												<TableHead className="font-extrabold text-gray-800">Architecture</TableHead>
												<TableHead className="font-extrabold text-gray-800">Series</TableHead>
												<TableHead className="font-extrabold text-gray-800 text-right">CUDA Cores</TableHead>
												<TableHead className="font-extrabold text-gray-800 text-right">TDP (W)</TableHead>
												<TableHead className="font-extrabold text-blue-600 text-right">Avg Speed ({speedUnitLabel})</TableHead>
												<TableHead className="font-extrabold text-blue-600 text-right">Efficiency ({effUnitLabel})</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{userAggregated.map((it, idx) => (
												<TableRow key={`${it.model}-${idx}`} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} border-b border-gray-200`}>
													<TableCell className="font-semibold text-gray-900">{it.model}</TableCell>
													<TableCell><Badge className="bg-gray-200 text-gray-700 border border-gray-300">{it.architecture}</Badge></TableCell>
													<TableCell><Badge variant="outline" className="border-gray-300 text-gray-600">{it.series}</Badge></TableCell>
													<TableCell className="font-medium text-gray-900 text-right font-mono">{NF_INT.format(it.cuda_cores)}</TableCell>
													<TableCell className="font-medium text-gray-900 text-right font-mono">{NF_INT.format(it.tdp_w || 0)}</TableCell>
													<TableCell className="text-blue-700 font-extrabold text-right">
														<div className="font-mono">{fmtSpeed(it.approx_keys_per_second_mkeys, unit)}</div>
														<div className="mt-1 h-1 bg-blue-100 rounded">
															<div className="h-1 bg-blue-500 rounded" style={{ width: `${userSpeedMax > 0 ? Math.round((it.approx_keys_per_second_mkeys / userSpeedMax) * 100) : 0}%` }} />
														</div>
													</TableCell>
													<TableCell className="text-green-700 font-extrabold text-right">
														<div className="font-mono">{(it.tdp_w ?? 0) > 0 ? fmtEff(computeEfficiency({ model: it.model, cuda_cores: it.cuda_cores, architecture: it.architecture, series: it.series, tdp_w: it.tdp_w ?? 0, approx_keys_per_second_mkeys: it.approx_keys_per_second_mkeys }), unit) : '-'}</div>
														<div className="mt-1 h-1 bg-green-100 rounded">
															<div className="h-1 bg-green-500 rounded" style={{ width: `${userEffMax > 0 && (it.tdp_w ?? 0) > 0 ? Math.round((computeEfficiency({ model: it.model, cuda_cores: it.cuda_cores, architecture: it.architecture, series: it.series, tdp_w: it.tdp_w ?? 0, approx_keys_per_second_mkeys: it.approx_keys_per_second_mkeys }) / userEffMax) * 100) : 0}%` }} />
														</div>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	)
}
