'use client'
import React from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Tooltip as ReTooltip } from 'recharts'
// Avoid tight coupling to recharts typings; accept compatible props

export type ChartSeriesConfig = {
	label: string
	color: string
}

export type ChartConfig = Record<string, ChartSeriesConfig>

type ChartContainerProps = {
	config: ChartConfig
	children: ReactNode
	className?: string
}

export function ChartContainer({ config, children, className }: ChartContainerProps) {
	const styleVars: CSSProperties = {}
	let idx = 1
	for (const [key, cfg] of Object.entries(config)) {
		Object.assign(styleVars, { [`--color-${key}`]: cfg.color } as CSSProperties)
		Object.assign(styleVars, { [`--chart-${idx}`]: cfg.color } as CSSProperties)
		idx++
	}
	return (
		<div className={className} style={styleVars}>
			{children}
		</div>
	)
}

type ChartTooltipProps = React.ComponentProps<typeof ReTooltip>

export function ChartTooltip(props: ChartTooltipProps) {
	return <ReTooltip {...props} />
}

type TooltipPayloadItem = {
  value?: number | string
  name?: string
  [key: string]: unknown
}

type ChartTooltipContentProps = {
  active?: boolean
  payload?: ReadonlyArray<TooltipPayloadItem>
  label?: number | string
  formatter?: (
    value: number | string,
    name: string | undefined,
    item: TooltipPayloadItem,
    index: number,
    payload: ReadonlyArray<TooltipPayloadItem>
  ) => React.ReactNode | [React.ReactNode, React.ReactNode]
  labelFormatter?: (label: number | string, payload: ReadonlyArray<TooltipPayloadItem>) => React.ReactNode
  indicator?: 'dot' | 'line'
  hideLabel?: boolean
}

export function ChartTooltipContent({ active, payload, label, hideLabel, labelFormatter, formatter }: ChartTooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]
  const raw = item.value
  const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 0
  const displayLabel = hideLabel ? '' : (
    labelFormatter ? labelFormatter(label ?? '', payload) : String(label ?? '')
  )
  let displayValue: React.ReactNode = new Intl.NumberFormat().format(num)
  if (formatter) {
    const formatted = formatter(raw ?? num, item.name, item, 0, payload)
    displayValue = Array.isArray(formatted) ? formatted[0] : formatted
  }
  return (
    <div className="px-2 py-1 rounded-md bg-white border border-gray-200 shadow-sm text-xs text-gray-700">
      {displayLabel && <div className="font-semibold mb-0.5">{displayLabel}</div>}
      <div>{displayValue}</div>
    </div>
  )
}
