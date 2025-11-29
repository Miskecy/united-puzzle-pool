'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Info = { puzzleDetected?: boolean }

export default function PuzzleBanner() {
  const [detected, setDetected] = useState(false)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const r = await fetch('/api/puzzle/info', { cache: 'no-store' })
        if (!r.ok) return
        const j: Info = await r.json()
        if (mounted) setDetected(!!j.puzzleDetected)
      } catch {}
    })()
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/puzzle/info', { cache: 'no-store' })
        if (!r.ok) return
        const j: Info = await r.json()
        setDetected(!!j.puzzleDetected)
      } catch {}
    }, 60000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  if (!detected) return null

  return (
    <div className="w-full bg-white border-b border-green-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-end">
        <Link href="/overview" className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs border border-green-200">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Puzzle key found
        </Link>
      </div>
    </div>
  )
}

