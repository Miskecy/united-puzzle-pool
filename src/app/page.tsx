"use client"
import Link from 'next/link';
import { Trophy, Users, Target, Zap, Bitcoin, BarChart3, BookOpen, UsersRound } from 'lucide-react';
import PuzzleInfoCard from '@/components/PuzzleInfoCard';
import PoolSpeedChart from '@/components/PoolSpeedChart';
import PoolActivityTimelineStandalone from '@/components/PoolActivityTimelineStandalone';
import { useEffect, useState } from 'react'


// As funções de fetch e a lógica de cálculo de validatedLabel foram mantidas aqui, mas
// devem ser gerenciadas em um arquivo utilitário ou serviço na produção.
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
	const [completedBlocks, setCompletedBlocks] = useState(0)
	const [validatedLabel, setValidatedLabel] = useState('0.00T')
	const [totalMiners, setTotalMiners] = useState('—')
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
				// Aggregate into 24 hourly bins for the last 24 hours (rolling window)
				const hourMs = 60 * 60 * 1000
				const endTs = Date.now()
				const startTs = endTs - 24 * hourMs
				const bins: Array<{ lenBI: bigint; secs: number; latestMs: number | null }> = Array.from({ length: 24 }, () => ({ lenBI: 0n, secs: 0, latestMs: null }))
				const currentHourIdx = 23

				const items = chartRecent.filter((rb: { completedAt?: string; createdAt?: string }) => {
					const cm = new Date(rb.completedAt || rb.createdAt || 0).getTime()
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

				const points: Array<{ t: number; ts?: number; v: number }> = bins.map((b, i) => {
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
					setAvgSpeedLabel(`${intPart.toString()}.${frac.toString().padStart(2, '0')} ${unit}`)
				} else {
					setAvgSpeedLabel('—')
				}
				if (overviewRes.ok) {
					const data = await overviewRes.json()
					const bins = Array.isArray(data.bins) ? data.bins : []
					let validated = 0
					let total = 0
					for (const b of bins) {
						validated += Number(b.completed || 0)
						total += Number(b.total || 0)
					}
					const T = 1_000_000_000_000
					const t = validated / T
					setValidatedLabel(`${t.toFixed(2)}T`)
					const remaining = Math.max(0, total - validated)
					setRemainingBKeys(remaining / 1_000_000_000)
				}
			} catch { }
		}
		fetchAll()
		const id = setInterval(fetchAll, 30000)
		return () => clearInterval(id)
	}, [])

	return (
		// PADRÃO 1: Fundo com degradê leve para dar profundidade
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 text-gray-900">

			{/* Hero Section */}
			<section className="relative overflow-hidden py-24 sm:py-32">
				<div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center">
						<div className="flex justify-center mb-6">
							<Bitcoin className="w-20 h-20 text-blue-600 mx-auto animate-pulse" />
						</div>
						{/* Títulos com cores e tamanhos PADRÃO */}
						<h1 className="text-6xl md:text-7xl font-extrabold text-gray-900 mb-6 tracking-tight">
							United <span className='text-blue-600'>Puzzle Pool</span>
						</h1>
						<p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto font-light">
							Join our <span className='font-semibold'>collaborative mining pool</span> to tackle the famous Bitcoin Puzzle.
							Work as a team!
						</p>

						{/* Botões de Ação */}
						<div className="flex flex-col sm:flex-row gap-4 justify-center">
							<Link
								href="/dashboard"
								className="bg-blue-600 text-white px-8 py-3.5 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-xl shadow-blue-200 inline-flex items-center gap-2 justify-center"
							>
								<Zap className='w-5 h-5' /> Get Started Now
							</Link>
							<Link
								href="/docs/api"
								className="border-2 border-gray-300 text-gray-700 px-8 py-3.5 rounded-lg font-semibold text-lg hover:bg-white hover:border-gray-400 transition-all duration-200 shadow-md inline-flex items-center gap-2 justify-center"
							>
								<BookOpen className='w-5 h-5' /> View Documentation
							</Link>
						</div>
					</div>
				</div>
			</section>



			{/* Puzzle Info & Quick Stats (Melhor Alinhamento) */}
			<section className="py-12 bg-white border-y border-gray-200 space-y-8">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

					{/* Bloco 1: Quick Stats */}
					<div className="lg:col-span-1 space-y-4">
						<h3 className="text-xl font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">Pool Metrics</h3>
						<div className="grid  gap-4">
							{/* Stat 1: Validação Total */}
							<div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
								<BarChart3 className="w-5 h-5 text-green-600 mx-auto mb-1" />
								<div className="text-xl font-extrabold text-gray-900">{validatedLabel}</div>
								<p className="text-xs text-gray-600">Total Validated</p>
							</div>
							{/* Stat 2: Blocos Completos */}
							<div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
								<Trophy className="w-5 h-5 text-blue-600 mx-auto mb-1" />
								<div className="text-xl font-extrabold text-gray-900">{Number(completedBlocks).toLocaleString('en-US')}</div>
								<p className="text-xs text-gray-600">Blocks Completed</p>
							</div>
							{/* Stat 3: Total Miners */}
							<div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
								<UsersRound className="w-5 h-5 text-purple-600 mx-auto mb-1" />
								<div className="text-xl font-extrabold text-gray-900">{totalMiners}</div>
								<p className="text-xs text-gray-600">Active Miners</p>
							</div>
						</div>
					</div>

					{/* Bloco 2: Puzzle Info Card (2/3 de largura) */}
					<div className="lg:col-span-2">
						{/* PuzzleInfoCard deve usar o mesmo estilo de card/sombra */}
						<PuzzleInfoCard variant="home" />
					</div>
				</div>
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<PoolSpeedChart points={speedPoints} avgLabel={avgSpeedLabel} remainingBKeys={remainingBKeys} />
				</div>
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
					{/* Split Panel: Active vs Validated */}
					<div className='pb-8'>
						<PoolActivityTimelineStandalone
							active={activeBlocks}
							validated={recentBlocks}
							animationsEnabled={true}
							isLoading={!activeBlocks.length && !recentBlocks.length}
						/>
					</div>
				</div>
			</section>



			{/* Features Section (Por que se juntar?) */}
			<section className="py-20 bg-gray-50">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
						Why Join Our Pool?
					</h2>
					{/* Grid de Features com design de card aprimorado */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">

						{/* Feature 1: Collaborative Work */}
						<div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-600 transition-all duration-300 shadow-lg hover:shadow-xl">
							<div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
								<Users className="w-6 h-6 text-blue-600" />
							</div>
							<h3 className="text-xl font-semibold text-gray-900 mb-3">Collaborative Work</h3>
							<p className="text-gray-600">
								Work with other miners to cover more ground and increase the chances of finding the solution.
							</p>
						</div>

						{/* Feature 2: Fair Rewards */}
						<div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-600 transition-all duration-300 shadow-lg hover:shadow-xl">
							<div className="w-14 h-14 bg-green-100 rounded-lg flex items-center justify-center mb-4">
								<Trophy className="w-6 h-6 text-green-600" />
							</div>
							<h3 className="text-xl font-semibold text-gray-900 mb-3">Fair Rewards</h3>
							<p className="text-gray-600">
								Earn credits by contributing processing power and receive your share if one of my devices finds the solution. If you find it, it&apos;s yours!
							</p>
						</div>

						{/* Feature 3: Focused Target */}
						<div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-600 transition-all duration-300 shadow-lg hover:shadow-xl">
							<div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
								<Target className="w-6 h-6 text-purple-600" />
							</div>
							<h3 className="text-xl font-semibold text-gray-900 mb-3">Focused Target</h3>
							<p className="text-gray-600">
								Focus on specific ranges of the Bitcoin puzzle, maximizing your hardware efficiency.
							</p>
						</div>

						{/* Feature 4: Maximum Efficiency */}
						<div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-600 transition-all duration-300 shadow-lg hover:shadow-xl">
							<div className="w-14 h-14 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
								<Zap className="w-6 h-6 text-yellow-600" />
							</div>
							<h3 className="text-xl font-semibold text-gray-900 mb-3">Maximum Efficiency</h3>
							<p className="text-gray-600">
								Optimized system that distributes work intelligently, avoiding duplicated effort.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* CTA Section (Limpo e Focado) */}
			<section className="py-20 bg-white">
				<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
					<h2 className="text-4xl font-bold text-gray-900 mb-6">
						Ready to get started?
					</h2>
					<p className="text-xl text-gray-600 mb-8">
						Join our pool and start contributing to solve the Bitcoin Puzzle today!
					</p>
					<Link
						href="/dashboard"
						className="inline-flex items-center space-x-2 bg-blue-600 text-white px-8 py-3.5 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-xl shadow-blue-200"
					>
						<span>Create My Account</span>
						<BookOpen className="w-5 h-5" />
					</Link>
				</div>
			</section>
		</div>
	);
}
