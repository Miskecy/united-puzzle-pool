"use client"
import Link from 'next/link';
import { Trophy, Users, Target, Zap, Bitcoin, BarChart3, BookOpen, UsersRound, ArrowRight } from 'lucide-react';
import PuzzleInfoCard from '@/components/PuzzleInfoCard';
import PoolSpeedChart from '@/components/PoolSpeedChart';
import PoolActivityTimelineStandalone from '@/components/PoolActivityTimelineStandalone';
import { useEffect, useState } from 'react'
import { useTranslation } from '@/contexts/LanguageContext'

type Point = { t: number; v: number }
type TimelineBlock = {
	id: string;
	hexRangeStart: string;
	hexRangeEnd: string;
	hexRangeStartRaw?: string;
	hexRangeEndRaw?: string;
	createdAt?: string | null;
	completedAt?: string | null;
	creditsAwarded: number;
	puzzleAddress?: string | null;
	bitcoinAddress?: string | null;
	puzzleName?: string | null;
	expiresAt?: string | null;
}

export default function HomePage() {
	const { t } = useTranslation()
	const [completedBlocks, setCompletedBlocks] = useState(0)
	const [validatedLabel, setValidatedLabel] = useState('0.00T')
	const [totalMiners, setTotalMiners] = useState<string | number>('—')
	const [speedPoints, setSpeedPoints] = useState<Point[]>([])
	const [avgSpeedLabel, setAvgSpeedLabel] = useState('—')
	const [remainingBKeys, setRemainingBKeys] = useState(0)
	const [recentBlocks, setRecentBlocks] = useState<TimelineBlock[]>([])
	const [activeBlocks, setActiveBlocks] = useState<TimelineBlock[]>([])

	useEffect(() => {
		const fetchAll = async () => {
			try {
				const [statsAllRes, stats24Res, overviewRes] = await Promise.all([
					fetch('/api/pool/stats', { cache: 'no-store' }),
					fetch('/api/pool/stats?days=1', { cache: 'no-store' }),
					fetch('/api/pool/overview', { cache: 'no-store' }),
				])
				let chartRecent: TimelineBlock[] = []
				if (statsAllRes.ok) {
					const statsAll = await statsAllRes.json()
					setCompletedBlocks(statsAll?.overview?.completedBlocks ?? 0)
					setTotalMiners(statsAll?.overview?.activeMiners ?? '—')
					const recentAll = Array.isArray(statsAll?.recentBlocks) ? statsAll.recentBlocks : []
					const activeAll = Array.isArray(statsAll?.activeBlocks) ? statsAll.activeBlocks : []
					setRecentBlocks(recentAll)
					setActiveBlocks(activeAll)
					chartRecent = recentAll
				}
				if (stats24Res.ok) {
					const stats24 = await stats24Res.json()
					const recent24 = Array.isArray(stats24?.recentBlocks) ? stats24.recentBlocks : []
					chartRecent = recent24
				}

				const hourMs = 60 * 60 * 1000
				const endTs = Date.now()
				const startTs = endTs - 24 * hourMs
				const bins: Array<{ lenBI: bigint; secs: number; latestMs: number | null }> =
					Array.from({ length: 24 }, () => ({ lenBI: 0n, secs: 0, latestMs: null }))

				const items = chartRecent.filter((rb) => {
					const cm = new Date(rb.completedAt ?? rb.createdAt ?? 0).getTime()
					return cm >= startTs && cm <= endTs
				})

				let totalLenBI = 0n
				let totalSeconds = 0
				for (const rb of items) {
					if (!rb.hexRangeStartRaw || !rb.hexRangeEndRaw || !rb.completedAt || !rb.createdAt) continue
					const s = BigInt(rb.hexRangeStartRaw)
					const e = BigInt(rb.hexRangeEndRaw)
					const lenBI = e >= s ? (e - s) : 0n
					const startMs = new Date(rb.createdAt).getTime()
					const endMs = new Date(rb.completedAt).getTime()
					const secs = Math.max(1, Math.floor((endMs - startMs) / 1000))
					totalLenBI += lenBI
					totalSeconds += secs
					const idx = Math.floor((endMs - startTs) / hourMs)
					if (idx >= 0 && idx < 24) {
						bins[idx].lenBI += lenBI
						bins[idx].secs += secs
						if (bins[idx].latestMs === null || endMs > (bins[idx].latestMs as number)) {
							bins[idx].latestMs = endMs
						}
					}
				}

				const points = bins.map((b, i) => {
					const hourStart = startTs + i * hourMs
					const latest = b.latestMs ?? hourStart
					const t = hourStart
					if (b.secs <= 0) return { t, ts: latest, v: 0 }
					const bkeys = Number(b.lenBI / 1_000_000_000n)
					const speed = bkeys / b.secs
					return { t, ts: latest, v: Number.isFinite(speed) ? speed : 0 }
				})
				setSpeedPoints(points)

				if (totalSeconds > 0) {
					const thresholds: Array<{ unit: string; divisor: bigint }> = [
						{ unit: 'PKeys/s', divisor: 1_000_000_000_000_000n },
						{ unit: 'TKeys/s', divisor: 1_000_000_000_000n },
						{ unit: 'BKeys/s', divisor: 1_000_000_000n },
						{ unit: 'MKeys/s', divisor: 1_000_000n },
						{ unit: 'KKeys/s', divisor: 1_000n },
					]
					const kpsTimes100 = (totalLenBI * 100n) / BigInt(totalSeconds)
					let unit = 'Keys/s'
					let divisor = 1n
					const kps = kpsTimes100 / 100n
					for (const t of thresholds) { if (kps >= t.divisor) { unit = t.unit; divisor = t.divisor; break } }
					const valTimes100 = kpsTimes100 / divisor
					const intPart = valTimes100 / 100n
					const frac = valTimes100 % 100n
					setAvgSpeedLabel(`${intPart}.${frac.toString().padStart(2, '0')} ${unit}`)
				} else {
					setAvgSpeedLabel('—')
				}

				if (overviewRes.ok) {
					const data = await overviewRes.json()
					const overviewBins = Array.isArray(data.bins) ? data.bins : []
					let validated = 0
					let total = 0
					for (const b of overviewBins) {
						validated += Number(b.completed || 0)
						total += Number(b.total || 0)
					}
					const T = 1_000_000_000_000
					const t = validated / T
					const formatted = new Intl.NumberFormat('en-US', { useGrouping: true, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(t)
					setValidatedLabel(`${formatted}T`)
					const remaining = Math.max(0, total - validated)
					setRemainingBKeys(remaining / 1_000_000_000)
				}
			} catch { }
		}
		fetchAll()
		const id = setInterval(fetchAll, 30000)
		return () => clearInterval(id)
	}, [])

	const features = [
		{
			icon: Users,
			title: t('home.features.collaborative.title'),
			body: t('home.features.collaborative.desc'),
		},
		{
			icon: Trophy,
			title: t('home.features.fairRewards.title'),
			body: t('home.features.fairRewards.desc'),
		},
		{
			icon: Target,
			title: t('home.features.focusedTarget.title'),
			body: t('home.features.focusedTarget.desc'),
		},
		{
			icon: Zap,
			title: t('home.features.maxEfficiency.title'),
			body: t('home.features.maxEfficiency.desc'),
		},
	]

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">

			{/* Hero */}
			<section className="relative overflow-hidden py-24 sm:py-32 px-4 sm:px-7">
				<div className="max-w-7xl mx-auto text-center">
					<div className="flex justify-center mb-8">
						<div
							className="w-20 h-20 rounded-2xl flex items-center justify-center"
							style={{ background: 'linear-gradient(135deg, #fc5c04 0%, #ff7226 100%)', boxShadow: '0 0 60px rgba(252,92,4,0.25)' }}
						>
							<Bitcoin className="w-10 h-10" style={{ color: '#0a0a0a' }} />
						</div>
					</div>

					<div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#fc5c04' }}>
						{t('home.hero.badge')}
					</div>
					<h1
						className="text-5xl sm:text-6xl md:text-7xl font-semibold mb-5"
						style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee', letterSpacing: '-0.01em' }}
					>
						United <span style={{ color: '#fc5c04' }}>Puzzle Pool</span>
					</h1>
					<p className="text-lg md:text-xl mb-10 max-w-2xl mx-auto" style={{ color: '#9a9892' }}>
						{t('home.hero.description')}
					</p>

					<div className="flex flex-col sm:flex-row gap-3 justify-center">
						<Link href="/dashboard" className="volt-btn-primary text-[15px] px-7 py-3">
							<Zap className="w-4 h-4" /> {t('home.hero.getStarted')}
						</Link>
						<Link href="/docs/api" className="volt-btn-ghost text-[15px] px-7 py-3">
							<BookOpen className="w-4 h-4" /> {t('home.hero.documentation')}
						</Link>
					</div>
				</div>
			</section>

			{/* Stats + Puzzle Info */}
			<section className="py-12 px-4 sm:px-7" style={{ borderTop: '1px solid #262624', borderBottom: '1px solid #262624', background: '#0d0d0d' }}>
				<div className="max-w-7xl mx-auto space-y-8">

					{/* Stat cards */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						{[
							{ icon: BarChart3, label: t('home.stats.totalValidated'), value: validatedLabel, color: '#3ddc84' },
							{ icon: Trophy, label: t('home.stats.blocksCompleted'), value: Number(completedBlocks).toLocaleString('en-US'), color: '#fc5c04' },
							{ icon: UsersRound, label: t('home.stats.activeMiners'), value: totalMiners, color: '#9a9892' },
						].map(({ icon: Icon, label, value, color }) => (
							<div
								key={label}
								className="volt-card p-4 flex flex-col justify-between"
								style={{ minHeight: 105 }}
							>
								<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{label}</span>
								<div>
									<div className="text-[22px] font-bold mt-1" style={{ fontFamily: 'var(--font-space-grotesk)', color, letterSpacing: '-0.02em' }}>
										{value}
									</div>
								</div>
								<Icon className="w-4 h-4 mt-1" style={{ color }} />
							</div>
						))}
					</div>

					{/* Puzzle Info */}
					<PuzzleInfoCard variant="home" />

					{/* Speed Chart */}
					<PoolSpeedChart points={speedPoints} avgLabel={avgSpeedLabel} remainingBKeys={remainingBKeys} />

					{/* Activity Timeline */}
					<div className="pb-4">
						<PoolActivityTimelineStandalone
							active={activeBlocks}
							validated={recentBlocks}
							animationsEnabled={true}
							isLoading={!activeBlocks.length && !recentBlocks.length}
						/>
					</div>
				</div>
			</section>

			{/* Features */}
			<section className="py-20 px-4 sm:px-7">
				<div className="max-w-7xl mx-auto">
					<div className="text-center mb-14">
						<div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#fc5c04' }}>{t('home.features.label')}</div>
						<h2 className="text-[30px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>
							{t('home.features.title')}
						</h2>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
						{features.map(({ icon: Icon, title, body }) => (
							<div
								key={title}
								className="volt-card p-6 transition-transform duration-300 hover:-translate-y-1.5 cursor-default"
							>
								<div
									className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
									style={{ background: 'rgba(252,92,4,0.1)', border: '1px solid rgba(252,92,4,0.15)' }}
								>
									<Icon className="w-5 h-5" style={{ color: '#fc5c04' }} />
								</div>
								<h3 className="text-base font-semibold mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{title}</h3>
								<p className="text-[13px] leading-relaxed" style={{ color: '#9a9892' }}>{body}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="py-20 px-4 sm:px-7" style={{ borderTop: '1px solid #262624' }}>
				<div className="max-w-3xl mx-auto text-center">
					<h2 className="text-[30px] font-semibold mb-4" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>
						{t('home.cta.title')}
					</h2>
					<p className="text-[15px] mb-8" style={{ color: '#9a9892' }}>
						{t('home.cta.description')}
					</p>
					<Link href="/dashboard" className="volt-btn-primary text-[15px] px-8 py-3.5 inline-flex">
						<span>{t('home.cta.startMining')}</span>
						<ArrowRight className="w-4 h-4" />
					</Link>
				</div>
			</section>
		</div>
	);
}
