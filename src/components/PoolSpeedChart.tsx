'use client'
import { Gauge, Clock, TrendingUp, Activity } from 'lucide-react'
import { useRef, useEffect } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { useTranslation } from '@/contexts/LanguageContext'

type Point = { t: number; v: number; ts?: number }
type Props = { points: Point[]; avgLabel: string; remainingBKeys?: number }

const ACCENT = '#fc5c04'
const ACCENT_END = '#c94800'
const NF = new Intl.NumberFormat('en-US', { useGrouping: true, minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PoolSpeedChart({ points, avgLabel, remainingBKeys }: Props) {
	const { t } = useTranslation()
	const chartData = points.map(p => ({ t: p.t, ts: p.ts, speed: Math.max(0, p.v) }))
	const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null
	const latestSpeed = latestPoint ? latestPoint.speed.toFixed(3) : '—'
	const latestSpeedNum = latestPoint ? latestPoint.speed : 0

	const nowAtMountRef = useRef<number>(0)
	const rtfRef = useRef<Intl.RelativeTimeFormat | null>(null)
	useEffect(() => { nowAtMountRef.current = Date.now(); try { rtfRef.current = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) } catch { } }, [])

	const prevSpeed = chartData.length >= 2 ? chartData[chartData.length - 2].speed : 0
	const trend = chartData.length >= 2 && prevSpeed > 0 ? (((chartData[chartData.length - 1].speed - prevSpeed) / prevSpeed) * 100).toFixed(1) : '0'
	const isPositiveTrend = parseFloat(trend) >= 0

	const chartConfig: ChartConfig = { speed: { label: 'Speed (BKeys/s)', color: ACCENT } }

	const dateFormatter = (v: number | string) => new Date(typeof v === 'number' ? v : Number(v)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

	const adaptiveNumCls = (s: string) => { const l = s.length; if (l <= 10) return 'text-4xl'; if (l <= 16) return 'text-3xl'; if (l <= 24) return 'text-2xl'; if (l <= 32) return 'text-xl'; return 'text-lg' }

	if (chartData.length === 0) {
		return (
			<div className="volt-card min-h-[300px] flex items-center justify-center">
				<div className="text-center p-8 space-y-3">
					<Activity className="h-14 w-14 mx-auto" style={{ color: '#3d3c38' }} />
					<p className="text-[15px] font-medium" style={{ color: '#5c5a55' }}>{t('poolSpeedChart.noData')}</p>
					<p className="text-[13px]" style={{ color: '#3d3c38' }}>{t('poolSpeedChart.noDataDesc')}</p>
				</div>
			</div>
		)
	}

	return (
		<div className="volt-card">
			{/* Header */}
			<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
				<div className="flex items-start justify-between">
					<div className="space-y-1">
						<div className="flex items-center gap-2.5">
							<div className="p-2 rounded-lg" style={{ background: 'rgba(252,92,4,0.1)' }}>
								<Gauge className="h-5 w-5" style={{ color: ACCENT }} />
							</div>
							<span className="text-[19px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('poolSpeedChart.title')}</span>
						</div>
						<p className="text-[12.5px] ml-11" style={{ color: '#5c5a55' }}>{avgLabel} {t('poolSpeedChart.lastAvg')}</p>
					</div>
					<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(252,92,4,0.08)', border: '1px solid rgba(252,92,4,0.2)' }}>
						<Clock className="h-3.5 w-3.5" style={{ color: ACCENT }} />
						<span className="text-[11.5px] font-semibold" style={{ color: ACCENT }}>{t('poolSpeedChart.today')}</span>
					</div>
				</div>
			</div>

			<div className="px-6 py-5 space-y-5">
				{/* Stat cards */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{/* Current speed */}
					<div className="rounded-xl p-4" style={{ background: 'rgba(252,92,4,0.06)', border: '1px solid rgba(252,92,4,0.15)' }}>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: ACCENT }}>{latestSpeed}</span>
							<span className="text-[13px] font-medium" style={{ color: 'rgba(252,92,4,0.7)' }}>{t('poolSpeedChart.bKeysS')}</span>
						</div>
						<p className="text-[11.5px] font-medium mt-1.5" style={{ color: ACCENT }}>{t('poolSpeedChart.currentSpeed')}</p>
					</div>

					{/* Trend */}
					<div className="rounded-xl p-4" style={{ background: '#131313', border: '1px solid #262624' }}>
						<div className="flex items-center gap-2">
							<TrendingUp className={`h-5 w-5 ${isPositiveTrend ? '' : 'rotate-180'}`} style={{ color: isPositiveTrend ? '#3ddc84' : '#f0554a' }} />
							<span className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: isPositiveTrend ? '#3ddc84' : '#f0554a' }}>{Math.abs(parseFloat(trend))}%</span>
							<span className="text-[13px] font-medium" style={{ color: '#9a9892' }}>{isPositiveTrend ? t('poolSpeedChart.up') : t('poolSpeedChart.down')} {t('poolSpeedChart.vsPrev')}</span>
						</div>
						<p className="text-[11.5px] font-medium mt-1.5" style={{ color: '#5c5a55' }}>{t('poolSpeedChart.recentChange')}</p>
					</div>

					{/* Time to solve */}
					<div className="rounded-xl p-4" style={{ background: '#131313', border: '1px solid #262624' }}>
						{remainingBKeys && latestSpeedNum > 0 ? (() => {
							const secs = remainingBKeys / latestSpeedNum
							const hours = secs / 3600; const days = hours / 24; const weeks = days / 7; const months = days / 30; const years = days / 365
							const units = [
								{ label: t('poolSpeedChart.timeUnits.millennium'), value: years / 1000 }, { label: t('poolSpeedChart.timeUnits.century'), value: years / 100 }, { label: t('poolSpeedChart.timeUnits.decades'), value: years / 10 },
								{ label: t('poolSpeedChart.timeUnits.years'), value: years }, { label: t('poolSpeedChart.timeUnits.months'), value: months }, { label: t('poolSpeedChart.timeUnits.weeks'), value: weeks },
								{ label: t('poolSpeedChart.timeUnits.days'), value: days }, { label: t('poolSpeedChart.timeUnits.hours'), value: hours },
							]
							let idx = units.findIndex(u => u.value >= 1); if (idx === -1) idx = units.length - 1
							const u = units[idx]; const valStr = !isFinite(u.value) ? '—' : (Math.abs(u.value) < 0.01 ? '<0.01' : NF.format(u.value))
							return (
								<div>
									<div className="flex items-start gap-2">
										<span className={`font-black tracking-tight break-all leading-tight w-full block ${adaptiveNumCls(valStr)}`} style={{ color: '#9a9892' }}>{valStr}</span>
										<span className="text-[13px] font-medium shrink-0" style={{ color: '#5c5a55' }}>{u.label}</span>
									</div>
									<p className="text-[11.5px] font-medium mt-1.5" style={{ color: '#5c5a55' }}>{t('poolSpeedChart.timeToSolve')}</p>
								</div>
							)
						})() : (
							<div>
								<span className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: '#5c5a55' }}>—</span>
								<p className="text-[11.5px] font-medium mt-1.5" style={{ color: '#5c5a55' }}>{t('poolSpeedChart.timeToSolve')}</p>
							</div>
						)}
					</div>
				</div>

				{/* Chart */}
				<div className="rounded-xl p-4" style={{ background: '#131313', border: '1px solid #262624' }}>
					<ChartContainer config={chartConfig} className="min-h-[200px] w-full ring-0 outline-none">
						<ResponsiveContainer width="100%" height={200}>
							<AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
								<CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#262624" opacity={0.6} />
								<XAxis dataKey="ts" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={dateFormatter} tick={{ fontSize: 11, fill: '#5c5a55' }} />
								<YAxis orientation="right" axisLine={false} tickLine={false} tickMargin={10} domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#5c5a55' }} />
								<ChartTooltip
									cursor={{ strokeDasharray: '4 4', stroke: ACCENT, strokeWidth: 2 }}
									content={({ active, payload }) => {
										if (!active || !payload || payload.length === 0) return null
										const data = payload[0].payload as { t: number; ts?: number; speed: number }
										const date = new Date(data.ts ?? data.t)
										const formatTimeAgo = (ms: number) => {
											const rtf = rtfRef.current; const s = Math.floor(ms / 1000)
											if (s < 60) return rtf ? rtf.format(-s, 'second') : `${s}s ago`
											const m = Math.floor(s / 60); if (m < 60) return rtf ? rtf.format(-m, 'minute') : `${m}m ago`
											const h = Math.floor(m / 60); if (h < 24) return rtf ? rtf.format(-h, 'hour') : `${h}h ago`
											const d = Math.floor(h / 24); if (d < 7) return rtf ? rtf.format(-d, 'day') : `${d}d ago`
											const w = Math.floor(d / 7); if (w < 4) return rtf ? rtf.format(-w, 'week') : `${w}w ago`
											const mo = Math.floor(d / 30); if (mo < 12) return rtf ? rtf.format(-mo, 'month') : `${mo}mo ago`
											return rtf ? rtf.format(-Math.floor(d / 365), 'year') : `${Math.floor(d / 365)}y ago`
										}
										return (
											<div className="rounded-lg p-3 min-w-[180px]" style={{ background: '#191919', border: '1px solid #262624' }}>
												<div className="space-y-2">
													<div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid #262624' }}>
														<Clock className="h-3.5 w-3.5" style={{ color: ACCENT }} />
														<span className="text-[11.5px] font-semibold" style={{ color: '#9a9892' }}>{date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
													</div>
													<div className="flex items-center gap-2">
														<span className="text-[11px]" style={{ color: '#5c5a55' }}>{t('poolSpeedChart.tooltipTime')}</span>
														<span className="text-[11px] font-medium" style={{ color: '#9a9892' }}>{date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
														<span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(252,92,4,0.1)', color: ACCENT }}>
															{formatTimeAgo(Math.max(0, nowAtMountRef.current - date.getTime()))}
														</span>
													</div>
													<div className="flex items-center gap-2">
														<div className="w-2 h-2 rounded-full" style={{ background: ACCENT }} />
														<span className="text-[11px]" style={{ color: '#5c5a55' }}>{t('poolSpeedChart.tooltipSpeed')}</span>
														<span className="text-[12px] font-bold" style={{ color: ACCENT }}>{data.speed.toFixed(3)} {t('poolSpeedChart.bKeysS')}</span>
													</div>
												</div>
											</div>
										)
									}}
								/>
								<defs>
									<linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor={ACCENT} stopOpacity={0.8} />
										<stop offset="50%" stopColor={ACCENT} stopOpacity={0.3} />
										<stop offset="100%" stopColor={ACCENT_END} stopOpacity={0.05} />
									</linearGradient>
								</defs>
								<Area dataKey="speed" type="monotone" stroke={ACCENT} strokeWidth={2.5} fill="url(#colorSpeed)" fillOpacity={1} />
							</AreaChart>
						</ResponsiveContainer>
					</ChartContainer>
				</div>

				<div className="flex items-center justify-between text-[11.5px]" style={{ color: '#5c5a55' }}>
					<span>{chartData.length} {t('poolSpeedChart.dataPoints')}</span>
					<span>{t('poolSpeedChart.period')}</span>
				</div>
			</div>
		</div>
	)
}
