import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { loadPuzzleConfig, parseHexBI } from '@/lib/config'

async function handler(req: NextRequest) {
  try {
    const cfg = await loadPuzzleConfig()
    if (!cfg) {
      return new Response(JSON.stringify({ error: 'Puzzle configuration missing' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    }
    const puzzleStart = parseHexBI(cfg.startHex) ?? 0n
    const puzzleEnd = parseHexBI(cfg.endHex) ?? (1n << 71n)
    const maxRange = puzzleEnd - puzzleStart
    const blocks = await prisma.blockAssignment.findMany({ select: { id: true, status: true, startRange: true, endRange: true } })

    const total = blocks.length
    const byStatus: Record<string, number> = { ACTIVE: 0, COMPLETED: 0, EXPIRED: 0 }
    for (const b of blocks) { byStatus[b.status] = (byStatus[b.status] || 0) + 1 }

    const intervals = blocks.map(b => ({ id: b.id, status: b.status, start: BigInt(b.startRange), end: BigInt(b.endRange) }))
      .filter(iv => iv.start < iv.end)

    // Duplicates (exact same start/end)
    const keyCount = new Map<string, number>()
    for (const iv of intervals) {
      const k = `${iv.start}-${iv.end}`
      keyCount.set(k, (keyCount.get(k) || 0) + 1)
    }
    const duplicates = Array.from(keyCount.values()).filter(v => v > 1).length

    // Overlaps among ACTIVE+COMPLETED
    const ac = intervals.filter(iv => iv.status === 'ACTIVE' || iv.status === 'COMPLETED').sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    let overlapCount = 0
    for (let i = 1; i < ac.length; i++) {
      if (ac[i].start < ac[i - 1].end) overlapCount++
      if (ac[i].end < ac[i].start) overlapCount++
    }

    // Randomness: histogram of start positions into 256 buckets over puzzle interval
    const buckets = new Array<number>(256).fill(0)
    for (const iv of intervals) {
      const relStart = iv.start > puzzleStart ? (iv.start - puzzleStart) : 0n
      const idx = maxRange > 0n ? Number((relStart * 256n) / maxRange) : 0
      const bi = idx < 0 ? 0 : idx > 255 ? 255 : idx
      buckets[bi]++
    }

    // Basic stats of sizes
    let totalSize = 0n
    let minSize: bigint | null = null
    let maxSize: bigint = 0n
    for (const iv of intervals) {
      const sz = iv.end - iv.start
      totalSize += sz
      if (minSize === null || sz < minSize) minSize = sz
      if (sz > maxSize) maxSize = sz
    }
    const avgSize = total > 0 ? Number(totalSize / BigInt(total)) : 0

    return new Response(
      JSON.stringify({
        total,
        byStatus,
        duplicates,
        overlaps: overlapCount,
        avgSize,
        minSize: minSize ? minSize.toString() : null,
        maxSize: maxSize.toString(),
        randomnessBuckets: buckets,
        clientAccept: req.headers.get('accept') || null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Pool analysis error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const GET = rateLimitMiddleware(handler)
