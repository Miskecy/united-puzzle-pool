'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/contexts/LanguageContext';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
	Hash, Gauge, CheckCircle2, RotateCcw, BrickWallFire,
	Clock, PieChart, List as ListIcon, Blocks, Pickaxe, Activity,
	TrendingUp, Users,
} from 'lucide-react';
import PuzzleInfoCard from '@/components/PuzzleInfoCard';
import BlocksTimeline from '@/components/BlocksTimeline';
import PoolActivityTimelineStandalone from '@/components/PoolActivityTimelineStandalone';
import PuzzleConfigNotice from '@/components/PuzzleConfigNotice';
import ValidationHeatmap from '@/components/ValidationHeatmap';

type BinStat = { index: number; startHex: string; endHex: string; total: number; completed: number; percent: number };
type RecentBlock = {
	id: string; bitcoinAddress: string;
	hexRangeStart: string; hexRangeEnd: string;
	hexRangeStartRaw?: string; hexRangeEndRaw?: string;
	createdAt?: string; completedAt: string; creditsAwarded: number;
};

function parseHexBI(hex: string): bigint { return BigInt(`0x${hex.replace(/^0x/, '')}`); }
function binLength(s: string, e: string): bigint { const a = parseHexBI(s), b = parseHexBI(e); return b >= a ? b - a : 0n; }
function pow2Label(len: bigint): string { return len <= 0n ? '0' : `2^${len.toString(2).length}`; }
function formatT(n: bigint): string {
	const T = 1_000_000_000_000n;
	const i = n / T, r = (n % T * 100n) / T;
	return `${i.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${r.toString().padStart(2, '0')}T`;
}
function toBI(n: number): bigint { return BigInt(Math.max(0, Math.floor(n))); }
function formatSpeedBI(len: bigint, secs: number): string {
	if (secs <= 0) return '—';
	const scaled = (len * 100n) / BigInt(secs);
	const thr = [
		{ u: 'PKeys/s', d: 1_000_000_000_000_000n }, { u: 'TKeys/s', d: 1_000_000_000_000n },
		{ u: 'BKeys/s', d: 1_000_000_000n }, { u: 'MKeys/s', d: 1_000_000n }, { u: 'KKeys/s', d: 1_000n },
	];
	const kps = scaled / 100n;
	let u = 'Keys/s', d = 1n;
	for (const t of thr) { if (kps >= t.d) { u = t.u; d = t.d; break; } }
	const v = scaled / d; return `${v / 100n}.${(v % 100n).toString().padStart(2, '0')} ${u}`;
}
function poolSpeed(recent: Array<{ hexRangeStartRaw?: string; hexRangeEndRaw?: string; createdAt?: string; completedAt: string }>): string {
	let len = 0n, secs = 0;
	for (const r of recent.slice(0, 10)) {
		if (!r.hexRangeStartRaw || !r.hexRangeEndRaw || !r.completedAt || !r.createdAt) continue;
		len += binLength(r.hexRangeStartRaw, r.hexRangeEndRaw);
		secs += Math.max(1, Math.floor((new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()) / 1000));
	}
	return formatSpeedBI(len, secs);
}
function categorizeLen(len: bigint): { label: string; color: string } {
	const B = 1_000_000_000n, T = 1_000_000_000_000n;
	if (len <= 10n * B) return { label: '≤10B', color: '#3ddc84' };
	if (len <= 250n * B) return { label: '≤250B', color: '#3ddc84' };
	if (len <= 1n * T) return { label: '≤1T', color: '#fc5c04' };
	if (len <= 10n * T) return { label: '≤10T', color: '#fc5c04' };
	if (len <= 20n * T) return { label: '≤20T', color: '#ff7226' };
	if (len >= 100n * T) return { label: '≥100T+', color: '#f0554a' };
	return { label: '20–100T', color: '#ff7226' };
}

export default function PoolOverviewPage() {
	const { t } = useTranslation();
	const [bins, setBins] = useState<BinStat[]>([]);
	const [meta, setMeta] = useState<{ binCount?: number; maxExp?: number; startExp?: number; endExp?: number; address?: string } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [noPuzzle, setNoPuzzle] = useState(false);
	const [recent, setRecent] = useState<RecentBlock[]>([]);
	const [active, setActive] = useState<RecentBlock[]>([]);
	const [miners, setMiners] = useState<Array<{ address: string; addressShort: string; tokenShort: string; avgSpeedLabel: string; validatedLabel: string; sharePercentLabel: string; totalBlocks: number }>>([]);
	const [hoveredBlockCells, setHoveredBlockCells] = useState<number[]>([]);
	const [nextPollInSec, setNextPollInSec] = useState(30);
	const [lastUpdated, setLastUpdated] = useState<number | null>(null);
	const [tab, setTab] = useState<'blocks' | 'miners'>('blocks');
	const router = useRouter();

	const fmtUpdated = (ts: number | null) => {
		if (!ts) return '—';
		const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
		if (s < 60) return t('common.timeAgo.s').replace('{n}', `${s}`);
		const m = Math.floor(s / 60); if (m < 60) return t('common.timeAgo.min').replace('{n}', `${m}`);
		const h = Math.floor(m / 60); if (h < 24) return t('common.timeAgo.h').replace('{n}', `${h}`);
		return t('common.timeAgo.d').replace('{n}', `${Math.floor(h / 24)}`);
	};

	useEffect(() => {
		(async () => {
			try {
				setLoading(true);
				const res = await fetch('/api/pool/overview');
				if (res.status === 404) { setNoPuzzle(true); return; }
				if (!res.ok) throw new Error('Failed to fetch overview');
				const data = await res.json();
				setBins(data.bins || []);
				const m = data.meta || {};
				const bitLen = (hex?: string) => { try { return hex ? BigInt(hex).toString(2).length : undefined; } catch { return undefined; } };
				setMeta({
					binCount: m.binCount,
					maxExp: typeof m.maxExp === 'number' ? m.maxExp : bitLen(m.puzzleEnd) ? (bitLen(m.puzzleEnd)! - 1) : undefined,
					startExp: bitLen(m.puzzleStart) ? bitLen(m.puzzleStart)! - 1 : undefined,
					endExp: typeof m.maxExp === 'number' ? m.maxExp : bitLen(m.puzzleEnd) ? (bitLen(m.puzzleEnd)! - 1) : undefined,
					address: m.address,
				});
				const [statsRes, minersRes] = await Promise.all([
					fetch('/api/pool/stats'),
					fetch('/api/pool/miners', { cache: 'no-store' }),
				]);
				if (statsRes.ok) { const s = await statsRes.json(); setRecent(s.recentBlocks || []); setActive(s.activeBlocks || []); }
				if (minersRes.ok) { const j = await minersRes.json(); setMiners(Array.isArray(j.miners) ? j.miners : []); }
				setLastUpdated(Date.now());
			} catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
			finally { setLoading(false); }
		})();
	}, []);

	useEffect(() => {
		const id = setInterval(() => setNextPollInSec(s => s <= 1 ? 30 : s - 1), 1000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		const poll = async () => {
			try {
				const [statsR, ovR] = await Promise.all([
					fetch('/api/pool/stats?take=20', { cache: 'no-store' }),
					fetch('/api/pool/overview', { cache: 'no-store' }),
				]);
				if (statsR.ok) { const j = await statsR.json(); setRecent(j.recentBlocks || []); setActive(j.activeBlocks || []); }
				if (ovR.ok) { const j = await ovR.json(); setBins(j.bins || []); setMeta(j.meta || null); }
				setLastUpdated(Date.now());
			} catch { }
		};
		const id = setInterval(poll, 30000);
		return () => clearInterval(id);
	}, []);

	const overallPow = meta?.maxExp ? `2^${meta.maxExp}` : pow2Label(bins.reduce((a: bigint, b) => a + binLength(b.startHex, b.endHex), 0n));
	const rangeBits = (meta?.startExp !== undefined && meta?.endExp !== undefined) ? `2^${meta.startExp}…2^${meta.endExp}` : null;
	const activeCells = meta?.binCount ?? bins.length;

	const { ratio: overallRatio, percent: overallPct } = (() => {
		const tot = bins.reduce((a, b) => ({ total: a.total + (b.total || 0), completed: a.completed + (b.completed || 0) }), { total: 0, completed: 0 });
		const r = tot.total > 0 ? Math.min(1, tot.completed / tot.total) : 0;
		return { ratio: r, percent: Math.round(r * 100) };
	})();

	const totalLenBI = bins.reduce((a: bigint, b) => a + binLength(b.startHex, b.endHex), 0n);
	const validatedBI = bins.reduce((a: bigint, b) => a + toBI(b.completed), 0n);
	const remainingBI = totalLenBI > validatedBI ? totalLenBI - validatedBI : 0n;
	const onePercentLabel = formatT(totalLenBI / 100n);

	const minedSegments = (() => {
		if (!bins.length) return { segs: [], legend: [] };
		const start = parseHexBI(bins[0].startHex), end = parseHexBI(bins[bins.length - 1].endHex);
		if (end <= start) return { segs: [], legend: [] };
		const full = end - start;
		const legendMap: Record<string, { color: string; count: number }> = {};
		const segs = recent.map(rb => {
			const sH = rb.hexRangeStartRaw || rb.hexRangeStart, eH = rb.hexRangeEndRaw || rb.hexRangeEnd;
			if (!sH || !eH) return null;
			const s2 = parseHexBI(sH), e2 = parseHexBI(eH);
			if (e2 <= s2) return null;
			const clS = s2 > start ? s2 : start, clE = e2 < end ? e2 : end;
			if (clE <= clS) return null;
			const len = clE - clS;
			const cat = categorizeLen(len);
			legendMap[cat.label] = { color: cat.color, count: (legendMap[cat.label]?.count || 0) + 1 };
			return { leftPct: Number(((clS - start) * 10000n) / full) / 100, widthPct: Number((len * 10000n) / full) / 100, ...cat };
		}).filter(Boolean) as Array<{ leftPct: number; widthPct: number; color: string; label: string }>;
		const legend = Object.entries(legendMap).map(([label, v]) => ({ label, color: v.color, count: v.count }));
		return { segs, legend };
	})();

	const hoverHandler = (startHex: string, endHex: string) => {
		if (!startHex || !endHex) { setHoveredBlockCells([]); return; }
		const s = parseHexBI(startHex), e = parseHexBI(endHex);
		setHoveredBlockCells(bins.reduce((acc: number[], b, bi) => {
			if (s <= parseHexBI(b.endHex) && e >= parseHexBI(b.startHex))
				acc.push(Math.max(0, 256 - (meta?.binCount ?? bins.length)) + bi);
			return acc;
		}, []));
	};

	if (loading && !bins.length) {
		return (
			<div className="min-h-screen bg-volt-bg flex items-center justify-center">
				<div className="text-center volt-fade-in">
					<div className="w-12 h-12 rounded-full border-2 border-transparent mx-auto mb-4" style={{ borderTopColor: '#fc5c04', animation: 'voltSpin 700ms linear infinite' }} />
					<p className="text-[13px]" style={{ color: '#5c5a55' }}>{t('dashboard.loading')}</p>
				</div>
			</div>
		);
	}
	if (noPuzzle) return <div className="min-h-screen bg-volt-bg"><div className="max-w-4xl mx-auto px-4 sm:px-7 py-12"><PuzzleConfigNotice /></div></div>;
	if (error) return (
		<div className="min-h-screen bg-volt-bg">
			<div className="max-w-4xl mx-auto px-4 sm:px-7 py-12">
				<div className="volt-card p-5">
					<p className="text-[13px]" style={{ color: '#f0554a' }}>Error: {error}</p>
				</div>
			</div>
		</div>
	);

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
			<div className="max-w-6xl mx-auto px-4 sm:px-7 py-10">

				{/* ── Page header ── */}
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
					<div>
						<div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: '#fc5c04' }}>{t('overview.pool')}</div>
						<h1 className="text-[28px] font-bold leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee', letterSpacing: '-0.02em' }}>{t('overview.overview')}</h1>
					</div>
					<div className="flex items-center gap-2 flex-wrap">
						<span className="volt-badge-accent">{overallPow}</span>
						{rangeBits && <span className="volt-badge-neutral font-mono text-[11px]">{rangeBits}</span>}
						<span className="volt-badge-success">{activeCells} {t('overview.cells')}</span>
						<div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px]" style={{ background: '#131313', border: '1px solid #262624', color: '#9a9892' }}>
							<Clock className="h-3 w-3" /> {fmtUpdated(lastUpdated)}
						</div>
						<button onClick={() => window.location.reload()} className="volt-btn-ghost text-[13px] px-3 py-1.5">
							<RotateCcw className="w-3.5 h-3.5" /> {t('common.refresh')}
						</button>
					</div>
				</div>

				{meta?.address && (
					<div className="mb-6">
						<PuzzleInfoCard variant="overview" />
					</div>
				)}

				{/* ── Tab switcher ── */}
				<div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-6" style={{ background: '#131313', border: '1px solid #262624' }}>
					{([
						{ key: 'blocks', icon: Blocks, label: t('overview.tabs.blocks') },
						{ key: 'miners', icon: Pickaxe, label: t('overview.tabs.miners') },
					] as const).map(({ key, icon: Icon, label }) => (
						<button
							key={key}
							onClick={() => setTab(key)}
							className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
							style={tab === key
								? { background: '#fc5c04', color: '#0a0a0a' }
								: { color: '#5c5a55' }
							}
						>
							<Icon className="h-4 w-4" /> {label}
						</button>
					))}
				</div>

				{/* ── Blocks tab ── */}
				{tab === 'blocks' && (
					<>
						{/* Metric cards */}
						<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">

							{/* Pool Speed */}
							<div className="volt-card p-5 flex flex-col gap-3">
								<div className="flex items-center justify-between">
									<div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(252,92,4,0.1)', border: '1px solid rgba(252,92,4,0.15)' }}>
										<Gauge className="h-4.5 w-4.5" style={{ color: '#fc5c04' }} />
									</div>
									<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('overview.blocks.poolSpeed')}</span>
								</div>
								<div>
									<div className="text-[22px] font-bold leading-none" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#fc5c04', letterSpacing: '-0.02em' }}>
										{poolSpeed(recent)}
									</div>
									<p className="text-[11px] mt-1.5" style={{ color: '#5c5a55' }}>{t('overview.blocks.avgOfLast')}</p>
								</div>
							</div>

							{/* Total Validated */}
							<div className="volt-card p-5 flex flex-col gap-3">
								<div className="flex items-center justify-between">
									<div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(61,220,132,0.1)', border: '1px solid rgba(61,220,132,0.15)' }}>
										<CheckCircle2 className="h-4.5 w-4.5" style={{ color: '#3ddc84' }} />
									</div>
									<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('overview.blocks.validated')}</span>
								</div>
								<div>
									<div className="text-[20px] font-bold font-mono leading-none" style={{ color: '#3ddc84', letterSpacing: '-0.01em' }}>{formatT(validatedBI)}</div>
									<div className="text-[11.5px] font-mono mt-1.5" style={{ color: '#5c5a55' }}>
										<span style={{ color: '#9a9892' }}>{formatT(remainingBI)}</span> {t('overview.blocks.remaining')}
									</div>
								</div>
							</div>

							{/* Range Swept */}
							<div className="volt-card p-5 flex flex-col gap-3">
								<div className="flex items-center justify-between">
									<div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(252,92,4,0.1)', border: '1px solid rgba(252,92,4,0.15)' }}>
										<TrendingUp className="h-4.5 w-4.5" style={{ color: '#fc5c04' }} />
									</div>
									<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('overview.blocks.rangeSwept')}</span>
								</div>
								<div>
									<div className="text-[28px] font-bold leading-none mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee', letterSpacing: '-0.03em' }}>
										{overallPct}<span className="text-[18px]" style={{ color: '#5c5a55' }}>%</span>
									</div>
									<div className="w-full rounded-full overflow-hidden mb-1.5" style={{ height: 5, background: '#1e1e1c' }}>
										<div style={{ width: `${overallPct}%`, height: 5, background: '#fc5c04', borderRadius: 9999, transition: 'width 700ms cubic-bezier(.4,0,.2,1)' }} />
									</div>
									<p className="text-[11px]" style={{ color: '#5c5a55' }}>
										{t('overview.blocks.approx')} <span className="font-mono" style={{ color: '#9a9892' }}>{onePercentLabel}</span>
									</p>
								</div>
							</div>

							{/* Mined Regions */}
							<div className="volt-card p-5 flex flex-col gap-3">
								<div className="flex items-center justify-between">
									<div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(61,220,132,0.1)', border: '1px solid rgba(61,220,132,0.15)' }}>
										<PieChart className="h-4.5 w-4.5" style={{ color: '#3ddc84' }} />
									</div>
									<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('overview.blocks.minedRegions')}</span>
								</div>
								<div>
									<div className="text-[28px] font-bold leading-none mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee', letterSpacing: '-0.03em' }}>
										{minedSegments.segs.length}
										<span className="text-[13px] ml-1.5" style={{ color: '#5c5a55' }}>{t('overview.blocks.segments')}</span>
									</div>
									<TooltipProvider delayDuration={100}>
										<div className="relative w-full rounded-full overflow-hidden mb-1.5" style={{ height: 5, background: '#1e1e1c' }}>
											<div className="absolute inset-0 overflow-hidden" style={{ width: `${overallPct}%` }}>
												{minedSegments.segs.map((s, i) => {
													const sL = (s.leftPct * overallPct) / 100;
													const sW = (s.widthPct * overallPct) / 100;
													return (
														<Tooltip key={i}>
															<TooltipTrigger asChild>
																<div className="absolute top-0 h-full opacity-80 hover:opacity-100" style={{ left: `${sL}%`, width: `${Math.max(sW, 0.3)}%`, background: s.color }} />
															</TooltipTrigger>
															<TooltipContent side="top">
																<span className="font-mono text-xs">{s.label} — {s.widthPct.toFixed(2)}%</span>
															</TooltipContent>
														</Tooltip>
													);
												})}
											</div>
										</div>
									</TooltipProvider>
									<div className="flex flex-wrap gap-2 mt-0.5">
										{minedSegments.legend.map((l, i) => (
											<span key={i} className="flex items-center gap-1 text-[10.5px]" style={{ color: '#9a9892' }}>
												<span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: l.color }} />
												{l.label} ({l.count})
											</span>
										))}
									</div>
								</div>
							</div>
						</div>

						{/* Live Activity — untouched */}
						<div className="mb-6">
							<div className="flex items-center gap-2 mb-3">
								<Activity className="h-4 w-4" style={{ color: '#fc5c04' }} />
								<span className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('overview.liveActivity.title')}</span>
								<div className="flex items-center gap-3 ml-auto text-[11px]" style={{ color: '#5c5a55' }}>
									<span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#fc5c04' }} />{t('overview.liveActivity.active')}</span>
									<span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#3ddc84' }} />{t('overview.liveActivity.validated')}</span>
								</div>
							</div>
							<PoolActivityTimelineStandalone
								active={active}
								validated={recent}
								animationsEnabled={true}
								isLoading={loading || (!active.length && !recent.length)}
								onHoverRange={hoverHandler}
							/>
						</div>

						{/* Heatmap — untouched */}
						<ValidationHeatmap
							bins={bins}
							binCount={meta?.binCount ?? bins.length}
							hoveredBlockCells={hoveredBlockCells}
							activeRanges={active.map(a => ({ startHex: a.hexRangeStartRaw || a.hexRangeStart, endHex: a.hexRangeEndRaw || a.hexRangeEnd }))}
							completedRanges={recent.map(r => ({ startHex: r.hexRangeStartRaw || r.hexRangeStart, endHex: r.hexRangeEndRaw || r.hexRangeEnd }))}
							onNavigateBin={(idx) => router.push(`/overview/bin/${idx}`)}
						/>

						{/* Last Completed Blocks — untouched */}
						<div className="mt-6">
							<div className="flex items-center justify-between mb-4">
								<div className="flex items-center gap-2">
									<BrickWallFire className="w-4 h-4" style={{ color: '#fc5c04' }} />
									<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('overview.lastCompleted')}</span>
								</div>
								{/* Last Completed Blocks - keeping as is since it's a technical term */}
								<span className="text-[11.5px]" style={{ color: '#5c5a55' }}>
									{t('overview.nextPoll').replace('{n}', `${nextPollInSec}`)}
								</span>
							</div>
							<BlocksTimeline items={recent.slice(0, 10)} pollUrl="/api/pool/stats?take=10&skip=0" pollIntervalMs={30000} direction="forward" speedMs={60000} gapPx={16} animationsEnabled={true} onHoverRange={hoverHandler} />
							<BlocksTimeline items={recent.slice(10, 20)} pollUrl="/api/pool/stats?take=10&skip=10" pollIntervalMs={30000} direction="reverse" speedMs={60000} gapPx={16} animationsEnabled={true} onHoverRange={hoverHandler} />
						</div>
					</>
				)}

				{/* ── Miners tab ── */}
				{tab === 'miners' && (
					<div className="volt-card">
						<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
							<div>
								<div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: '#fc5c04' }}>{t('overview.miners.title')}</div>
								<div className="flex items-center gap-2">
									<Users className="h-4 w-4" style={{ color: '#fc5c04' }} />
									<span className="text-[19px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('overview.miners.subtitle')}</span>
								</div>
							</div>
							<span className="text-[12px]" style={{ color: '#5c5a55' }}>
								{miners.length} {miners.length !== 1 ? t('overview.miners.miners') : t('overview.miners.miner')}
							</span>
						</div>

						{miners.length === 0 ? (
							<div className="px-6 py-14 text-center">
								<Pickaxe className="h-8 w-8 mx-auto mb-3" style={{ color: '#2a2926' }} />
								<p className="text-[13px]" style={{ color: '#5c5a55' }}>{t('overview.miners.noMiners')}</p>
							</div>
						) : (
							<div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
								{miners.map((m, idx) => (
									<div key={idx} className="rounded-xl p-4" style={{ background: '#111110', border: '1px solid #1e1e1c' }}>

										{/* Rank + address */}
										<div className="flex items-center gap-3 mb-4">
											<div
												className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
												style={{
													background: idx === 0 ? 'rgba(252,92,4,0.15)' : idx === 1 ? 'rgba(255,255,255,0.06)' : '#1a1a18',
													border: `1px solid ${idx === 0 ? 'rgba(252,92,4,0.3)' : '#262624'}`,
													color: idx === 0 ? '#fc5c04' : idx === 1 ? '#f4f3ee' : '#5c5a55',
												}}
											>
												#{idx + 1}
											</div>
											<div className="min-w-0">
												<div className="font-mono text-[12.5px] font-semibold truncate" style={{ color: '#f4f3ee' }}>{m.addressShort}</div>
												<div className="font-mono text-[11px] truncate" style={{ color: '#5c5a55' }}>{m.tokenShort}</div>
											</div>
										</div>

										{/* Stats */}
										<div className="space-y-2.5" style={{ borderTop: '1px solid #1e1e1c', paddingTop: 12 }}>
											{[
												{ icon: Gauge, label: t('overview.miners.avgSpeed'), value: m.avgSpeedLabel, color: '#fc5c04' },
												{ icon: CheckCircle2, label: t('overview.miners.validated'), value: m.validatedLabel, color: '#3ddc84' },
												{ icon: PieChart, label: t('overview.miners.poolShare'), value: m.sharePercentLabel, color: '#3ddc84' },
												{ icon: ListIcon, label: t('overview.miners.totalBlocks'), value: String(m.totalBlocks), color: '#9a9892' },
											].map(({ icon: Icon, label, value, color }) => (
												<div key={label} className="flex items-center justify-between">
													<span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: '#5c5a55' }}>
														<Icon className="h-3.5 w-3.5 shrink-0" /> {label}
													</span>
													<span className="text-[12px] font-semibold font-mono" style={{ color }}>{value}</span>
												</div>
											))}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
