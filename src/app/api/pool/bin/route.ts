import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { loadPuzzleConfig } from '@/lib/config'

function parseHexBI(hex: string | undefined): bigint | null {
  if (!hex) return null
  const clean = hex.replace(/^0x/, '')
  try { return BigInt(`0x${clean}`) } catch { return null }
}

function toHex(big: bigint): string {
  return `0x${big.toString(16)}`
}

function intersectLen(aStart: bigint, aEnd: bigint, bStart: bigint, bEnd: bigint): bigint {
  const start = aStart > bStart ? aStart : bStart
  const end = aEnd < bEnd ? aEnd : bEnd
  if (end <= start) return 0n
  return end - start
}

async function handler(req: NextRequest) {
  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
    }

    const cfg = await loadPuzzleConfig()
    if (!cfg) {
      return new Response(JSON.stringify({ error: 'Puzzle configuration missing' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    const puzzleStart = parseHexBI(cfg.startHex) ?? 0n
    const puzzleEnd = parseHexBI(cfg.endHex) ?? (1n << 71n)
    const PUZZLE_LEN = puzzleEnd - puzzleStart
    if (PUZZLE_LEN <= 0n) {
      return new Response(JSON.stringify({ error: 'Empty puzzle range' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const url = req.nextUrl
    const indexParam = Number(url.searchParams.get('index') || -1)
    const takeParam = Number(url.searchParams.get('take') || 0)
    const skipParam = Number(url.searchParams.get('skip') || 0)

    const maxExp = puzzleEnd > 0n ? puzzleEnd.toString(2).length : 1
    const BIN_COUNT = Math.max(1, Math.min(256, maxExp))
    const idxNum = (isFinite(indexParam) && indexParam >= 0 && indexParam < BIN_COUNT) ? indexParam : -1
    if (idxNum < 0) {
      return new Response(JSON.stringify({ error: 'Invalid bin index' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const take = (isFinite(takeParam) && takeParam > 0 && takeParam <= 100) ? takeParam : 50
    const skip = (isFinite(skipParam) && skipParam >= 0) ? skipParam : 0

    const baseChunk = PUZZLE_LEN / BigInt(BIN_COUNT)
    const remainder = PUZZLE_LEN % BigInt(BIN_COUNT)
    let cursor = puzzleStart
    let binStart = puzzleStart
    let binEnd = puzzleStart
    for (let i = 0; i < BIN_COUNT; i++) {
      const extra = i < Number(remainder) ? 1n : 0n
      const size = baseChunk + extra
      const start = cursor
      const end = start + size
      if (i === idxNum) { binStart = start; binEnd = end }
      cursor = end
    }

    const rows = await prisma.blockAssignment.findMany({
      include: { blockSolution: true, userToken: true },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
      skip: 0,
    })

    const inBin = [] as typeof rows
    for (const a of rows) {
      const s = parseHexBI(a.startRange)
      const e = parseHexBI(a.endRange)
      if (s === null || e === null) continue
      const inc = intersectLen(s, e, binStart, binEnd)
      if (inc > 0n) inBin.push(a)
    }

    const total = inBin.length
    const pageItems = inBin.slice(skip, skip + take).map(b => ({
      id: b.id,
      status: b.status,
      bitcoinAddress: b.puzzleAddressSnapshot || b.userToken?.bitcoinAddress || '',
      hexRangeStart: toHex(parseHexBI(b.startRange) ?? 0n),
      hexRangeEnd: toHex(parseHexBI(b.endRange) ?? 0n),
      createdAt: b.createdAt,
      expiresAt: b.expiresAt || null,
      completedAt: b.blockSolution?.createdAt || null,
      creditsAwarded: Number(b.blockSolution?.creditsAwarded || 0) / 1000,
    }))

    const meta = {
      index: idxNum,
      startHex: toHex(binStart),
      endHex: toHex(binEnd),
      totalItems: total,
      binCount: BIN_COUNT,
    }

    return new Response(JSON.stringify({ meta, items: pageItems }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Bin blocks error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const GET = rateLimitMiddleware(handler)
