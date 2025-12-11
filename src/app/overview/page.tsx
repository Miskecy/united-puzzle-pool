'use client';

import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Hash, Expand, Gauge, CheckCircle2, RotateCcw, Flame, BrickWallFire, Clock, Bitcoin, Key, PieChart, List as ListIcon, Blocks, Pickaxe } from 'lucide-react';
import PuzzleInfoCard from '@/components/PuzzleInfoCard';
import BlocksTimeline from '@/components/BlocksTimeline';
import PoolActivityTimelineStandalone from '@/components/PoolActivityTimelineStandalone';
import PuzzleConfigNotice from '@/components/PuzzleConfigNotice';


type BinStat = {
	index: number;
	startHex: string;
	endHex: string;
	total: number;
	completed: number;
	percent: number;
};

type RecentBlock = {
	id: string;
	bitcoinAddress: string;
	hexRangeStart: string;
	hexRangeEnd: string;
	hexRangeStartRaw?: string;
	hexRangeEndRaw?: string;
	createdAt?: string;
	completedAt: string;
	creditsAwarded: number;
};

const HEATMAP_COLORS = Array.from({ length: 50 }, (_, i) => {
	const t = i / 49;
	const hue = Math.round(220 - 220 * t);
	const sat = Math.round(40 + 45 * t);
	const light = Math.round(88 - 43 * t);
	const alpha = 0.35 + 0.65 * t;
	return `hsla(${hue}, ${sat}%, ${light}%, ${alpha.toFixed(2)})`;
});

function heatColor(percent: number, completed?: number, mode: 'percent' | 'absolute' = 'percent', absMax?: number): string {
	const colors = HEATMAP_COLORS;
	if (mode === 'absolute') {
		const max = absMax && isFinite(absMax) && absMax > 0 ? absMax : 1;
		const c = completed && isFinite(completed) ? Math.max(0, completed) : 0;
		const ratio = Math.max(0, Math.min(1, c / max));
		const idx = Math.round(ratio * (colors.length - 1));
		return colors[idx];
	} else {
		const p = isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
		const idx = Math.round((p / 100) * (colors.length - 1));
		return colors[idx];
	}
}

function parseHexBI(hex: string): bigint {
	const clean = hex.replace(/^0x/, '');
	return BigInt(`0x${clean}`);
}

function binLength(startHex: string, endHex: string): bigint {
	const s = parseHexBI(startHex);
	const e = parseHexBI(endHex);
	return e >= s ? e - s : 0n;
}

function pow2Label(len: bigint): string {
	if (len <= 0n) return '0';
	const expCeil = len.toString(2).length;
	return `2^${expCeil}`;
}

function formatTrillionsNum(n: number): string {
	const t = n / 1_000_000_000_000;
	if (t >= 100) return `${Math.round(t)}T`;
	if (t >= 10) return `${t.toFixed(1)}T`;
	return `${t.toFixed(2)}T`;
}

function formatTrillionsBI(n: bigint): string {
	const T = 1_000_000_000_000n;
	const tInt = n / T;
	const rem = n % T;
	const twoDec = (rem * 100n) / T;
	const intStr = tInt.toString();
	const withCommas = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return `${withCommas}.${twoDec.toString().padStart(2, '0')}T`;
}

function toBI(n: number): bigint {
	if (!Number.isFinite(n)) return 0n;
	const safe = Math.max(0, Math.floor(n));
	return BigInt(safe);
}

function formatPercentPrecise(completed: number, lenBI: bigint): string {
	try {
		const len = lenBI;
		if (len <= 0n) return '0.00000%';
		const cBI = toBI(completed);
		const scale = 100000n;
		const scaled = (cBI * 100n * scale) / len;
		const intPart = scaled / scale;
		const frac = scaled % scale;
		return `${intPart.toString()}.${frac.toString().padStart(5, '0')}%`;
	} catch {
		return '0.00000%';
	}
}

function formatSpeedBI(totalLenBI: bigint, totalSeconds: number): string {
	if (totalSeconds <= 0) return '—';
	const scaled = (totalLenBI * 100n) / BigInt(totalSeconds);
	const thresholds: Array<{ unit: string; divisor: bigint }> = [
		{ unit: 'PKeys/s', divisor: 1_000_000_000_000_000n },
		{ unit: 'TKeys/s', divisor: 1_000_000_000_000n },
		{ unit: 'BKeys/s', divisor: 1_000_000_000n },
		{ unit: 'MKeys/s', divisor: 1_000_000n },
		{ unit: 'KKeys/s', divisor: 1_000n },
	];
	const kps = scaled / 100n;
	let unit = 'Keys/s';
	let divisor = 1n;
	for (const t of thresholds) {
		if (kps >= t.divisor) { unit = t.unit; divisor = t.divisor; break; }
	}
	const valTimes100 = scaled / divisor;
	const intPart = valTimes100 / 100n;
	const frac = valTimes100 % 100n;
	return `${intPart.toString()}.${frac.toString().padStart(2, '0')} ${unit}`;
}

function computePoolSpeed(recent: Array<{ hexRangeStartRaw?: string; hexRangeEndRaw?: string; createdAt?: string; completedAt: string }>): string {
	const items = recent.slice(0, 10);
	let totalLen = 0n;
	let totalSeconds = 0;
	for (const rb of items) {
		if (!rb.hexRangeStartRaw || !rb.hexRangeEndRaw || !rb.completedAt || !rb.createdAt) continue;
		const len = binLength(rb.hexRangeStartRaw, rb.hexRangeEndRaw);
		const start = new Date(rb.createdAt).getTime();
		const end = new Date(rb.completedAt).getTime();
		const secs = Math.max(1, Math.floor((end - start) / 1000));
		totalLen += len;
		totalSeconds += secs;
	}
	if (totalSeconds <= 0) return '—';
	return formatSpeedBI(totalLen, totalSeconds);
}

function computeTotalsT(bins: BinStat[]): string {
	let totalBI = 0n;
	let validatedBI = 0n;
	for (const b of bins) {
		const len = binLength(b.startHex, b.endHex);
		totalBI += len;
		validatedBI += toBI(b.completed);
	}
	const remainingBI = totalBI - validatedBI;
	const remainingClamped = remainingBI < 0n ? 0n : remainingBI;
	return `${formatTrillionsBI(validatedBI)} / ${formatTrillionsBI(remainingClamped)}`;
}

function adaptiveTextClass(s: string): string {
	const len = s.length;
	if (len <= 20) return 'text-xl';
	if (len <= 28) return 'text-lg';
	if (len <= 36) return 'text-base';
	return 'text-sm';
}

function formatCompactHexRange(hex: string): string {
	const s = hex.startsWith('0x') ? hex.slice(2) : hex;
	if (s.length <= 24) return `0x${s}`;
	const head = s.slice(0, 10);
	const tail = s.slice(-8);
	return `0x${head}…${tail}`;
}

// --- COMPONENTE PRINCIPAL ---
export default function PoolOverviewPage() {
	// ESTADO
	const [bins, setBins] = useState<BinStat[]>([]);
	const [meta, setMeta] = useState<{ binCount?: number; maxExp?: number; startExp?: number; endExp?: number; address?: string } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [noPuzzle, setNoPuzzle] = useState(false);
	const [recent, setRecent] = useState<RecentBlock[]>([]);
	const [active, setActive] = useState<RecentBlock[]>([]);
	const [miners, setMiners] = useState<Array<{ address: string; addressShort: string; tokenShort: string; avgSpeedLabel: string; validatedLabel: string; sharePercentLabel: string; totalBlocks: number }>>([]);
	const [colorMode, setColorMode] = useState<'percent' | 'absolute'>('percent');
	const [hoveredCell, setHoveredCell] = useState<number | null>(null);
	const [hoveredBlockCells, setHoveredBlockCells] = useState<number[]>([]);
	const [nextPollInSec, setNextPollInSec] = useState<number>(30);
	const [lastUpdated, setLastUpdated] = useState<number | null>(null);

	function formatLastUpdated(ts: number | null): string {
		if (!ts) return '—';
		const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
		if (diff < 60) return `${diff}s ago`;
		const m = Math.floor(diff / 60);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		return `${d}d ago`;
	}

	const maxAbsCompleted = Math.max(0, ...bins.map(b => Math.max(0, b.completed || 0)));

	useEffect(() => {
		const load = async () => {
			try {
				setLoading(true);
				const res = await fetch('/api/pool/overview');
				if (res.status === 404) {
					setNoPuzzle(true);
					setBins([]);
					setMeta(null);
				} else if (!res.ok) {
					throw new Error('Failed to fetch overview');
				} else {
					const data = await res.json();
					setBins(data.bins || []);
					const m = data.meta || {};
					const bitLen = (hex?: string) => { if (!hex) return undefined; try { const bi = BigInt(hex); return bi.toString(2).length; } catch { return undefined; } };
					const startLen = bitLen(m.puzzleStart);
					const endLen = bitLen(m.puzzleEnd);
					const startExp = typeof startLen === 'number' ? (startLen - 1) : undefined;
					const endExpVal = typeof m.maxExp === 'number'
						? m.maxExp
						: (typeof endLen === 'number' ? (endLen - 1) : undefined);
					setMeta({
						binCount: typeof m.binCount === 'number' ? m.binCount : undefined,
						maxExp: endExpVal,
						startExp: startExp,
						endExp: endExpVal,
						address: typeof m.address === 'string' ? m.address : undefined,
					});
				}
				const statsRes = await fetch('/api/pool/stats');
				if (statsRes.ok) {
					const stats = await statsRes.json();
					setRecent(stats.recentBlocks || []);
					setActive(stats.activeBlocks || []);
				}
				const minersRes = await fetch('/api/pool/miners', { cache: 'no-store' });
				if (minersRes.ok) {
					const j = await minersRes.json();
					setMiners(Array.isArray(j.miners) ? j.miners : []);
				}
				setLastUpdated(Date.now());
			} catch (e) {
				setError(e instanceof Error ? e.message : 'Failed to load overview');
			} finally {
				setLoading(false);
			}
		};
		load();
	}, []);

	useEffect(() => {
		const pollMs = 30000;
		const tick = () => {
			const rem = Math.ceil((pollMs - (Date.now() % pollMs)) / 1000);
			setNextPollInSec(Math.max(0, rem));
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		const poll = async () => {
			try {
				const r = await fetch('/api/pool/stats?take=20', { cache: 'no-store' })
				if (r.ok) {
					const j = await r.json()
					setRecent(j.recentBlocks || [])
					setActive(j.activeBlocks || [])
					setLastUpdated(Date.now())
				}
			} catch { }
		}
		poll()
		const id = setInterval(poll, 30000)
		return () => clearInterval(id)
	}, [])

	useEffect(() => {
		const pollOverview = async () => {
			try {
				const r = await fetch('/api/pool/overview', { cache: 'no-store' })
				if (r.ok) {
					const j = await r.json()
					setBins(j.bins || [])
					setMeta(j.meta || null)
					setLastUpdated(Date.now())
				}
			} catch { }
		}
		pollOverview()
		const id = setInterval(pollOverview, 30000)
		return () => clearInterval(id)
	}, [])

	// Cálculo das métricas exibidas
	const overallPow: string = meta?.maxExp ? `2^${meta.maxExp}` : pow2Label(bins.reduce((acc: bigint, b) => acc + binLength(b.startHex, b.endHex), 0n));
	const rangeBits: string | null = (meta?.startExp !== undefined && meta?.endExp !== undefined) ? `2^${meta.startExp}…2^${meta.endExp}` : null;
	const activeCells: number = meta?.binCount ?? bins.length;
	const totalCells = 256; // Número total de células para preencher o grid (16x16)
	const offset = Math.max(0, totalCells - activeCells);


	// Renderização de Estado (Loading/No Puzzle)
	if (loading && bins.length === 0) {
		return (
			<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 text-gray-900">
				<div className="max-w-6xl mx-auto px-4 py-12">
					<div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm animate-pulse">
						<div className="h-6 w-40 bg-gray-200 rounded mb-2" />
						<div className="h-4 w-64 bg-gray-200 rounded" />
					</div>
				</div>
			</div>
		);
	}
	if (noPuzzle) { return (<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100"><div className="max-w-4xl mx-auto px-4 py-12"><PuzzleConfigNotice /></div></div>); }
	if (error) { return (<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100"><div className="max-w-4xl mx-auto px-4 py-12"><div className="bg-red-100 border border-red-400 p-4 rounded text-red-800">Error: {error}</div></div></div>); }


	return (
		// PADRÃO 1: Fundo com degradê
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 text-gray-900">
			<div className="max-w-6xl mx-auto px-4 py-12">

				{/* Header e Meta (NOVO PADRÃO VISUAL) */}
				<Card className="mb-8 shadow-sm border-gray-200">
					<CardHeader className="border-b pb-4">
						<div className="flex items-center justify-between">
							<div className='flex items-center gap-2'>
								<div className="p-3 bg-blue-100 rounded-full">
									<Hash className="h-6 w-6 text-blue-600" />
								</div>
								<div>
									<CardTitle className="text-2xl font-bold text-gray-900">Pool Overview</CardTitle>
									<CardDescription className="text-gray-600">A visual summary of the puzzle’s progress and recent validations.</CardDescription>
								</div>
							</div>
							<div className="flex items-center gap-3">
								<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200">
									<Clock className="h-4 w-4 text-blue-600" />
									<span className="text-xs font-semibold text-blue-700">Last Updated</span>
									<Badge variant="outline" className="text-[10px] font-bold border-blue-300 text-blue-700 bg-white">
										{formatLastUpdated(lastUpdated)}
									</Badge>
								</div>
								<button
									onClick={() => window.location.reload()}
									className='text-sm text-gray-600 hover:text-blue-600 px-3 py-1 rounded-md transition-colors inline-flex items-center gap-1'
								>
									<RotateCcw className='w-4 h-4' /> Refresh
								</button>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="flex flex-wrap items-center gap-4">
							<span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-md font-semibold text-sm inline-flex items-center gap-2">
								<Expand className='w-4 h-4' /> Difficulty: {overallPow}
							</span>
							{rangeBits && (
								<span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md font-mono text-sm">
									Bits Range: {rangeBits}
								</span>
							)}
							<span className="px-3 py-1 bg-green-50 text-green-700 rounded-md font-semibold text-sm">
								Active Cells: {activeCells}
							</span>
						</div>
						<div className="mt-4">
							{/* Assumindo que PuzzleInfoCard usa o mesmo estilo */}
							{meta?.address && <PuzzleInfoCard variant="overview" />}
						</div>
					</CardContent>
				</Card>

				<Tabs defaultValue="overview" className="w-full">
					<TabsList className="w-full overflow-x-auto bg-transparent">
						<TabsTrigger value="overview" className="inline-flex items-center gap-2 data-[state=active]:text-blue-600"><Blocks className="h-4 w-4" /> Blocks</TabsTrigger>
						<TabsTrigger value="miners" className="inline-flex items-center gap-2 data-[state=active]:text-blue-600"><Pickaxe className="h-4 w-4" /> Miners</TabsTrigger>
					</TabsList>

					<TabsContent value="overview">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
							<Card className="col-span-1 shadow-sm border-gray-200">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<h3 className="text-gray-900 font-semibold flex items-center gap-2 text-lg">
										<Gauge className="h-5 w-5 text-blue-600" /> Pool Speed
									</h3>
									<span className="text-xs text-gray-500">(last 10 blocks)</span>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-bold text-blue-700">{computePoolSpeed(recent)}</div>
									<div className="text-sm text-gray-600 mt-1">Average speed computed from the last 10 completions.</div>
								</CardContent>
							</Card>

							<Card className="shadow-sm border-gray-200">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<h3 className="text-gray-900 font-semibold flex items-center gap-2 text-lg">
										<CheckCircle2 className="h-5 w-5 text-green-600" /> Total Validation
									</h3>
								</CardHeader>
								<CardContent>
									{(() => {
										const t = computeTotalsT(bins);
										const cls = adaptiveTextClass(t);
										return (
											<div className={`text-gray-900 font-mono ${cls}`}>
												<span className="px-2 py-1 bg-gray-100 rounded break-all block w-fit leading-tight">{t}</span>
											</div>
										);
									})()}
									<div className="text-sm text-gray-600 mt-1">Validated / Remaining (T-keys).</div>
								</CardContent>
							</Card>
						</div>

						<div className='pb-8'>
							<PoolActivityTimelineStandalone
								active={active}
								validated={recent}
								animationsEnabled={true}
								isLoading={loading || (!active.length && !recent.length)}
								onHoverRange={(startHex: string, endHex: string) => {
									if (!startHex || !endHex) { setHoveredBlockCells([]); return }
									const start = parseHexBI(startHex);
									const end = parseHexBI(endHex);
									const indices: number[] = [];
									for (let bi = 0; bi < bins.length; bi++) {
										const bs = parseHexBI(bins[bi].startHex);
										const be = parseHexBI(bins[bi].endHex);
										if (start <= be && end >= bs) {
											indices.push(Math.max(0, 256 - (meta?.binCount ?? bins.length)) + bi);
										}
									}
									setHoveredBlockCells(indices);
								}}
							/>
						</div>

						<Card className="shadow-md border-gray-200 mb-8">
							<CardHeader className="border-b pb-4">
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
									<Flame className="h-5 w-5 text-orange-600" /> Validation Heatmap
								</CardTitle>
								<CardDescription className="text-gray-600">Visual intensity of validated key space across the puzzle.</CardDescription>
							</CardHeader>
							<CardContent className="pt-6">

								{/* Controles de Modo de Cor */}
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center gap-2 text-sm text-gray-700">
										<Gauge className="h-4 w-4 text-orange-600" />
										<span className="font-semibold">Color Scale Mode</span>
									</div>
									<div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
										<button
											type="button"
											onClick={() => setColorMode('percent')}
											className={`px-3 py-1 text-xs font-medium ${colorMode === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
										>Percent</button>
										<button
											type="button"
											onClick={() => setColorMode('absolute')}
											className={`px-3 py-1 text-xs font-medium border-l border-gray-300 ${colorMode === 'absolute' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
										>Absolute (T-keys)</button>
									</div>
								</div>

								<p className="text-xs text-gray-600 mb-4">Darker colors indicate higher validation either by <span className="font-semibold">percent</span> or <span className="font-semibold">absolute</span> mode. Cells outside the configured puzzle range appear transparent with a dashed border.</p>

								{/* Heatmap Grid */}
								<TooltipProvider delayDuration={0}>
									<div className="heatmap-container bg-purple-100/10 border border-gray-100  rounded-lg p-3 sm:p-4">
										<div className="inline-grid heatmap-grid">
											{Array.from({ length: totalCells }, (_, i) => {
												const cell = i >= offset ? (bins[i - offset] ?? null) : null;
												const lenBI = cell ? binLength(cell.startHex, cell.endHex) : 0n;
												const lenPow = cell ? pow2Label(lenBI) : '';
												const completedT = cell ? formatTrillionsNum(cell.completed) : '';
												const totalT = cell ? formatTrillionsBI(lenBI) : '';
												const bg = cell ? ((cell.completed ?? 0) > 0 ? heatColor(cell.percent, cell.completed, colorMode, maxAbsCompleted) : 'transparent') : 'transparent';
												const isHovered = hoveredCell === i || hoveredBlockCells.includes(i);

												const colorsLen = HEATMAP_COLORS.length;
												let colorIdx = 0;
												if (cell && (cell.completed ?? 0) > 0) {
													if (colorMode === 'absolute') {
														const max = maxAbsCompleted && isFinite(maxAbsCompleted) && maxAbsCompleted > 0 ? maxAbsCompleted : 1;
														const c = cell.completed && isFinite(cell.completed) ? Math.max(0, cell.completed) : 0;
														const ratio = Math.max(0, Math.min(1, c / max));
														colorIdx = Math.round(ratio * (colorsLen - 1));
													} else {
														const p = isFinite(cell.percent) ? Math.max(0, Math.min(100, cell.percent)) : 0;
														colorIdx = Math.round((p / 100) * (colorsLen - 1));
													}
												}
												const textClass = colorIdx >= 35 ? 'text-white' : 'text-gray-700';

												const style = cell
													? {
														backgroundColor: bg,
														border: isHovered ? '2px solid #3b82f6' : '1px solid rgba(0,0,0,0.1)',
														transform: isHovered ? 'scale(1.05)' : 'scale(1)',
														zIndex: isHovered ? 10 : 1
													}
													: {
														backgroundColor: bg,
														border: '1px dashed #d1d5db',
														opacity: 0.5
													};

												return (
													<Tooltip key={i} open={hoveredCell === i}>
														<TooltipTrigger asChild>
															<div
																style={style}
																className="w-full rounded-md relative overflow-hidden cursor-pointer heatmap-cell transition-all duration-200"
																onMouseEnter={() => setHoveredCell(i)}
																onMouseLeave={() => setHoveredCell(null)}
																onClick={() => setHoveredCell(prev => (prev === i ? null : i))}
															>
																{cell && (
																	<span className={`absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] ${textClass} font-semibold pointer-events-none`}>
																		{lenPow}
																	</span>
																)}
															</div>
														</TooltipTrigger>
														{cell && (
															<TooltipContent side="top" align="center" sideOffset={8} className="bg-gray-900 border-gray-800 text-white max-w-xs">
																<div className="space-y-3 p-2">
																	<div className="flex items-center gap-2 font-semibold text-sm border-b border-gray-700 pb-2">
																		<Hash className="h-4 w-4 text-blue-400" />
																		<span className="font-mono text-blue-400">Bin {cell.index + 1} / {activeCells}</span>
																	</div>
																	<div className="flex items-start gap-2 text-xs">
																		<Expand className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
																		<div className="font-mono text-gray-300 overflow-hidden">
																			<div className="font-medium text-white mb-1">Range</div>
																			<div className="text-[10px] break-all">{formatCompactHexRange(cell.startHex)}</div>
																			<div className="text-[10px] break-all opacity-80">{formatCompactHexRange(cell.endHex)}</div>
																		</div>
																	</div>
																	<div className="flex items-center gap-2 text-xs text-gray-300">
																		<Gauge className="h-3 w-3 text-purple-400" />
																		<span className="font-mono"><span className="font-medium text-white">Length:</span> {lenPow}</span>
																	</div>
																	<div className="flex items-center gap-2 text-xs text-gray-300">
																		<CheckCircle2 className="h-3 w-3 text-green-400" />
																		<span className="font-mono"><span className="font-medium text-white">Validated:</span> {formatPercentPrecise(cell.completed, lenBI)}</span>
																	</div>
																	<div className="text-xs font-mono text-gray-300">
																		<span className="font-medium text-white">Progress:</span> {completedT} / {totalT}
																	</div>
																</div>
																<TooltipPrimitive.Arrow className="fill-gray-900" width={10} height={6} />
															</TooltipContent>
														)}
													</Tooltip>
												);
											})}
										</div>
									</div>
								</TooltipProvider>

								{/* Legenda de Escala */}
								<div className="mt-4 text-sm text-gray-600 flex flex-col sm:flex-row sm:items-center gap-4">
									<div className="flex items-center gap-2 scale-container">
										<span className="font-semibold">Scale: 0%</span>
										{HEATMAP_COLORS.map((c, i) => (
											<span key={i} className="inline-block rounded-sm scale-swatch h-3 w-3" style={{ backgroundColor: c }}></span>
										))}
										<span className="font-semibold">100%</span>
									</div>
								</div>
							</CardContent>
						</Card>

						<div className="mt-6">
							<div className="flex items-center justify-between py-2">
								<h3 className="text-gray-900 font-semibold flex items-center gap-2 text-xl">
									<div className=' bg-blue-100 p-3 rounded-full'>

										<BrickWallFire className="w-5 h-5 text-blue-500" />
									</div>
									Last Completed Blocks
								</h3>
								<p className="text-sm text-gray-600">Polling: next in <span className='text-blue-600 font-semibold'>{nextPollInSec}s</span></p>
							</div>
							<BlocksTimeline
								items={recent.slice(0, 10)}
								pollUrl="/api/pool/stats?take=10&skip=0"
								pollIntervalMs={30000}
								direction="forward"
								speedMs={60000}
								gapPx={16}
								animationsEnabled={true}
								onHoverRange={(startHex: string, endHex: string) => {
									if (!startHex || !endHex) { setHoveredBlockCells([]); return }
									const start = parseHexBI(startHex);
									const end = parseHexBI(endHex);
									const indices: number[] = [];
									for (let bi = 0; bi < bins.length; bi++) {
										const bs = parseHexBI(bins[bi].startHex);
										const be = parseHexBI(bins[bi].endHex);
										if (start <= be && end >= bs) {
											indices.push(Math.max(0, 256 - (meta?.binCount ?? bins.length)) + bi);
										}
									}
									setHoveredBlockCells(indices);
								}}
							/>

							<div className="mt-0">
								<BlocksTimeline
									items={recent.slice(10, 20)}
									pollUrl="/api/pool/stats?take=10&skip=10"
									pollIntervalMs={30000}
									direction="reverse"
									speedMs={60000}
									gapPx={16}
									animationsEnabled={true}
									onHoverRange={(startHex: string, endHex: string) => {
										if (!startHex || !endHex) { setHoveredBlockCells([]); return }
										const start = parseHexBI(startHex);
										const end = parseHexBI(endHex);
										const indices: number[] = [];
										for (let bi = 0; bi < bins.length; bi++) {
											const bs = parseHexBI(bins[bi].startHex);
											const be = parseHexBI(bins[bi].endHex);
											if (start <= be && end >= bs) {
												indices.push(Math.max(0, 256 - (meta?.binCount ?? bins.length)) + bi);
											}
										}
										setHoveredBlockCells(indices);
									}}
								/>
							</div>
						</div>

					</TabsContent>

					<TabsContent value="miners">
						<Card className="shadow-sm border-gray-200">
							<CardHeader className="border-b pb-4">
								<CardTitle className="text-xl font-bold text-gray-900 flex gap-2 items-center justify-start"><Pickaxe className='h-6 w-6 text-blue-500 ' />Active Miners</CardTitle>
								<CardDescription className="text-gray-600">Address, token, speed, validated keys, share and blocks.</CardDescription>
							</CardHeader>
							<CardContent className="pt-6">
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									{miners.map((m, idx) => (
										<div key={idx} className="border rounded-lg p-4 bg-white shadow-sm">
											<div className="flex items-center gap-2 text-sm text-gray-500">
												<Bitcoin className="h-4 w-4 text-blue-600" /> Address
											</div>
											<div className="font-mono text-gray-900 font-semibold mb-2">{m.addressShort}</div>
											<div className="flex items-center gap-2 text-sm text-gray-500">
												<Key className="h-4 w-4 text-gray-700" /> Token
											</div>
											<div className="font-mono text-gray-900 mb-2">{m.tokenShort}</div>
											<div className="flex justify-between items-center text-sm mt-2">
												<span className="flex items-center gap-1 text-gray-500"><Gauge className="h-4 w-4 text-blue-600" /> Average Speed</span>
												<span className="font-semibold text-blue-700">{m.avgSpeedLabel}</span>
											</div>
											<div className="flex justify-between items-center text-sm mt-1">
												<span className="flex items-center gap-1 text-gray-500"><CheckCircle2 className="h-4 w-4 text-green-600" /> Total Validated</span>
												<span className="font-semibold text-gray-900">{m.validatedLabel}</span>
											</div>
											<div className="flex justify-between items-center text-sm mt-1">
												<span className="flex items-center gap-1 text-gray-500"><PieChart className="h-4 w-4 text-emerald-600" /> Share</span>
												<span className="font-semibold text-green-700">{m.sharePercentLabel}</span>
											</div>
											<div className="flex justify-between items-center text-sm mt-1">
												<span className="flex items-center gap-1 text-gray-500"><ListIcon className="h-4 w-4 text-gray-700" /> Total Blocks</span>
												<span className="font-semibold">{m.totalBlocks}</span>
											</div>
										</div>
									))}
									{miners.length === 0 && (
										<div className="text-sm text-gray-600">No miners found.</div>
									)}
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>


			{/* CSS para o Grid, movido para um bloco <style jsx> ou arquivo CSS global */}
			<style jsx>{`
                .heatmap-grid { display: grid; grid-template-columns: repeat(16, minmax(0, 1fr)); gap: 3px; }
                @media (max-width: 640px) { .heatmap-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; } }
                @media (min-width: 641px) and (max-width: 1024px) { .heatmap-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 3px; } }
                .heatmap-cell { width: 100%; aspect-ratio: 3 / 1; min-height: 18px; }
                @media (max-width: 640px) { .heatmap-cell { aspect-ratio: 3 / 1; min-height: 16px; } }
                @media (min-width: 641px) and (max-width: 1024px) { .heatmap-cell { aspect-ratio: 3 / 1; min-height: 17px; } }
                .scale-container { display: flex; flex-wrap: wrap; gap: 6px; }
                .scale-swatch { display: inline-block; width: 12px; height: 12px; border: 1px solid rgba(0,0,0,0.08); transition: transform .15s ease, box-shadow .15s ease; cursor: pointer; }
                .scale-swatch:hover { transform: translateY(-1px) scale(1.7); box-shadow: 0 0 0 2px rgba(59,130,246,.25); z-index: 5; }


            `}</style>
		</div>
	);
}
