'use client'
import { useEffect } from 'react'

export default function ClientInit() {
	useEffect(() => {
		if (typeof window !== 'undefined' && typeof performance !== 'undefined') {
			const origMeasure = performance.measure.bind(performance) as (
				name: string,
				startOrOptions?: string | PerformanceMeasureOptions,
				endMark?: string
			) => void
			if (process.env.NODE_ENV !== 'production') {
				performance.measure = ((name: string, startOrOptions?: string | PerformanceMeasureOptions, endMark?: string) => {
					try {
						origMeasure(name, startOrOptions, endMark)
					} catch (err: unknown) {
						const msg = typeof err === 'object' && err !== null && 'message' in err
							? String((err as { message?: unknown }).message)
							: String(err || '')
						if (msg.includes('negative time stamp') || msg.includes("Failed to execute 'measure'")) {
							return
						}
						throw err
					}
				}) as typeof performance.measure
			}
		}
	}, [])
	return null
}
