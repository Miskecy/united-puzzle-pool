'use client'
import { Gauge, Clock, TrendingUp, Activity } from 'lucide-react'
import { useRef, useEffect } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'

type Point = { t: number; v: number }

type Props = {
	points: Point[]
	avgLabel: string
	remainingBKeys?: number
}

const PRIMARY_COLOR_HSL = 'hsl(217.2 91.2% 59.8%)'
const PRIMARY_COLOR_HSL_END = 'hsl(262.1 83.3% 57.8%)'
const NF_EN_US_2DP = new Intl.NumberFormat('en-US', { useGrouping: true, minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PoolSpeedChart({ points, avgLabel, remainingBKeys }: Props) {
	const chartData = points.map(p => ({ t: p.t, speed: Math.max(0, p.v) }))
	const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null
	const latestSpeed = latestPoint ? latestPoint.speed.toFixed(3) : '—'
	const latestSpeedNum = latestPoint ? latestPoint.speed : 0

	const nowAtMountRef = useRef<number>(0)
	const rtfRef = useRef<Intl.RelativeTimeFormat | null>(null)
	useEffect(() => {
		nowAtMountRef.current = Date.now()
		try {
			rtfRef.current = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
		} catch { }
	}, [])

	// Calculate trend
	const prevSpeed = chartData.length >= 2 ? chartData[chartData.length - 2].speed : 0
	const trend = chartData.length >= 2 && prevSpeed > 0
		? (((chartData[chartData.length - 1].speed - prevSpeed) / prevSpeed) * 100).toFixed(1)
		: '0'
	const isPositiveTrend = parseFloat(trend) >= 0

	const chartConfig: ChartConfig = {
		speed: { label: 'Speed (BKeys/s)', color: PRIMARY_COLOR_HSL },
	}

	const dateFormatter = (value: number | string) => {
		const num = typeof value === 'number' ? value : Number(value)
		const d = new Date(num)
		if (points.length > 50) {
			return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
		}
		const m = d.toLocaleDateString(undefined, { month: 'short' })
		const day = d.getDate()
		return `${m} ${day}`
	}

	if (chartData.length === 0) {
		return (
			<Card className="bg-linear-to-br from-white to-gray-50 border border-gray-200 shadow-lg min-h-[400px] flex items-center justify-center">
				<div className="text-center p-8">
					<Activity className="h-16 w-16 text-gray-300 mx-auto mb-4" />
					<p className="text-gray-500 text-lg font-medium">No speed data available</p>
					<p className="text-gray-400 text-sm mt-2">Data will appear here when available</p>
				</div>
			</Card>
		)
	}

	return (
		<Card className="bg-linear-to-br from-white via-white to-blue-50/30 border border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300">
			<CardHeader className="pb-3 space-y-0">
				<div className="flex items-start justify-between">
					<div className="space-y-1">
						<div className="flex items-center gap-2.5">
							<div className="p-2 bg-blue-100 rounded-lg">
								<Gauge className="h-5 w-5 text-blue-600" />
							</div>
							<CardTitle className="text-xl font-bold text-gray-900">
								Pool Speed
							</CardTitle>
						</div>
						<CardDescription className="text-sm text-gray-500 ml-11">
							{avgLabel}
						</CardDescription>
					</div>
					<div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-200">
						<Clock className="h-4 w-4 text-blue-600" />
						<span className="text-xs font-semibold text-blue-700">Last 7 days</span>
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-6">
				{/* Stats Section */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					<div className="bg-linear-to-br from-blue-50 to-blue-100/50 rounded-xl p-4 border border-blue-200/50">
						<div className="flex items-baseline gap-2">
							<span className="text-3xl sm:text-4xl lg:text-5xl font-black text-blue-600 tracking-tight">
								{latestSpeed}
							</span>
							<span className="text-sm font-medium text-blue-600/70">BKeys/s</span>
						</div>
						<p className="text-xs font-medium text-blue-700 mt-1.5">Current Speed</p>
					</div>

					<div className="bg-linear-to-br from-gray-50 to-gray-100/50 rounded-xl p-4 border border-gray-200/50">
						<div className="flex items-center gap-2">
							<TrendingUp className={`h-5 w-5 ${isPositiveTrend ? 'text-green-600' : 'text-red-600 rotate-180'}`} />
							<span className={`text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight ${isPositiveTrend ? 'text-green-600' : 'text-red-600'}`}>
								{Math.abs(parseFloat(trend))}%
							</span>
							<span className="text-sm font-medium text-gray-600">{isPositiveTrend ? 'up' : 'down'} vs previous</span>
						</div>
						<p className="text-xs font-medium text-gray-600 mt-1.5">Recent Change</p>
					</div>

					<div className="bg-linear-to-br from-purple-50 to-purple-100/50 rounded-xl p-4 border border-purple-200/50">
						{remainingBKeys && latestSpeedNum > 0 ? (
							(() => {
								const secs = remainingBKeys / latestSpeedNum
								const hours = secs / 3600
								const days = hours / 24
								const weeks = days / 7
								const months = days / 30
								const years = days / 365
								const units = [
									{ label: 'Millennium', value: years / 1000 },
									{ label: 'Century', value: years / 100 },
									{ label: 'Decades', value: years / 10 },
									{ label: 'Years', value: years },
									{ label: 'Months', value: months },
									{ label: 'Weeks', value: weeks },
									{ label: 'Days', value: days },
									{ label: 'Hours', value: hours },
								]
								let idx = units.findIndex(u => u.value >= 1)
								if (idx === -1) idx = units.length - 1
								const u = units[idx]
								const val = !isFinite(u.value) ? '—' : (Math.abs(u.value) < 0.01 ? '<0.01' : NF_EN_US_2DP.format(u.value))
								return (
									<div>
										<div className="flex items-baseline gap-2">
											<span className="text-2xl sm:text-3xl lg:text-4xl font-black text-purple-700 tracking-tight">
												{val}
											</span>
											<span className="text-sm font-medium text-purple-700/80">{u.label}</span>
										</div>
										<p className="text-xs font-medium text-purple-700 mt-1.5">Time to Solve</p>
									</div>
								)
							})()
						) : (
							<div>
								<div className="flex items-baseline gap-2">
									<span className="text-2xl sm:text-3xl lg:text-4xl font-black text-purple-700 tracking-tight">—</span>
								</div>
								<p className="text-xs font-medium text-purple-700 mt-1.5">Time to Solve</p>
							</div>
						)}
					</div>
				</div>

				{/* Chart Section */}
				<div className="bg-white rounded-xl border border-gray-200 p-4">
					<ChartContainer config={chartConfig} className="min-h-[200px] w-full">
						<ResponsiveContainer width="100%" height={200}>
							<AreaChart
								accessibilityLayer
								data={chartData}
								margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
							>
								<CartesianGrid
									vertical={false}
									strokeDasharray="3 3"
									className="stroke-gray-200"
									opacity={0.5}
								/>
								<XAxis
									dataKey="t"
									tickLine={false}
									axisLine={false}
									tickMargin={10}
									tickFormatter={dateFormatter}
									className="text-xs fill-gray-500"
									tick={{ fontSize: 11 }}
								/>
								<YAxis
									orientation="right"
									axisLine={false}
									tickLine={false}
									tickMargin={10}
									className="text-xs fill-gray-500"
									domain={['auto', 'auto']}
									tick={{ fontSize: 11 }}
								/>

								<ChartTooltip
									cursor={{ strokeDasharray: '4 4', stroke: PRIMARY_COLOR_HSL, strokeWidth: 2 }}
									content={({ active, payload }) => {
										if (!active || !payload || payload.length === 0) return null
										const data = payload[0].payload
										const date = new Date(data.t)
										const formatTimeAgo = (ms: number) => {
											const rtf = rtfRef.current
											const s = Math.floor(ms / 1000)
											if (s < 60) return rtf ? rtf.format(-s, 'second') : `${s}s ago`
											const m = Math.floor(s / 60)
											if (m < 60) return rtf ? rtf.format(-m, 'minute') : `${m}m ago`
											const h = Math.floor(m / 60)
											if (h < 24) return rtf ? rtf.format(-h, 'hour') : `${h}h ago`
											const d = Math.floor(h / 24)
											if (d < 7) return rtf ? rtf.format(-d, 'day') : `${d}d ago`
											const w = Math.floor(d / 7)
											if (w < 4) return rtf ? rtf.format(-w, 'week') : `${w}w ago`
											const mo = Math.floor(d / 30)
											if (mo < 12) return rtf ? rtf.format(-mo, 'month') : `${mo}mo ago`
											const y = Math.floor(d / 365)
											return rtf ? rtf.format(-y, 'year') : `${y}y ago`
										}

										return (
											<div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]">
												<div className="space-y-2">
													<div className="flex items-center gap-2 pb-2 border-b border-gray-100">
														<Clock className="h-4 w-4 text-blue-600" />
														<span className="text-xs font-semibold text-gray-700">
															{date.toLocaleDateString('en-US', {
																weekday: 'short',
																day: 'numeric',
																month: 'short',
																year: 'numeric'
															})}
														</span>
													</div>
													<div className="flex items-center gap-2">
														<span className="text-xs text-gray-500">Time:</span>
														<span className="text-xs font-medium text-gray-700">
															{date.toLocaleTimeString('en-US', {
																hour: '2-digit',
																minute: '2-digit',
																second: '2-digit'
															})}
														</span>
														<span className="ml-auto text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
															{formatTimeAgo(nowAtMountRef.current - date.getTime())}
														</span>
													</div>
													<div className="flex items-center gap-2 pt-1">
														<div className="w-2 h-2 rounded-full bg-blue-600"></div>
														<span className="text-xs text-gray-500">Speed:</span>
														<span className="text-sm font-bold text-blue-600">
															{data.speed.toFixed(3)} BKeys/s
														</span>
													</div>
												</div>
											</div>
										)
									}}
								/>

								<defs>
									<linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor={PRIMARY_COLOR_HSL} stopOpacity={0.9} />
										<stop offset="50%" stopColor={PRIMARY_COLOR_HSL} stopOpacity={0.4} />
										<stop offset="100%" stopColor={PRIMARY_COLOR_HSL_END} stopOpacity={0.1} />
									</linearGradient>
									<filter id="shadow">
										<feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
									</filter>
								</defs>

								<Area
									dataKey="speed"
									type="monotone"
									stroke={PRIMARY_COLOR_HSL}
									strokeWidth={2.5}
									fill="url(#colorSpeed)"
									fillOpacity={1}
									filter="url(#shadow)"
								/>
							</AreaChart>
						</ResponsiveContainer>
					</ChartContainer>
				</div>

				{/* Footer Info */}
				<div className="flex items-center justify-between text-xs text-gray-500 pt-2">
					<span>{chartData.length} data points recorded</span>
					<span className="text-gray-400">Period: 7 days</span>
				</div>
			</CardContent>
		</Card>
	)
}
