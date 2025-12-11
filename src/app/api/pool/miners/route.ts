import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'

type MinerAgg = {
  userTokenId: string
  token: string
  bitcoinAddress: string
  totalBlocks: number
  totalLenBI: bigint
  totalSeconds: number
  creditsMu: number
}

function shortenMiddle(s: string, head = 6, tail = 6): string {
  if (!s) return '—'
  if (s.length <= head + tail + 3) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

function parseHexBI(hex: string | null | undefined): bigint | null {
  if (!hex) return null
  const clean = hex.replace(/^0x/, '')
  try { return BigInt(`0x${clean}`) } catch { return null }
}

function formatSpeedBI(totalLenBI: bigint, totalSeconds: number): string {
  if (totalSeconds <= 0) return '—'
  const scaled = (totalLenBI * 100n) / BigInt(totalSeconds)
  const thresholds: Array<{ unit: string; divisor: bigint }> = [
    { unit: 'PKeys/s', divisor: 1_000_000_000_000_000n },
    { unit: 'TKeys/s', divisor: 1_000_000_000_000n },
    { unit: 'BKeys/s', divisor: 1_000_000_000n },
    { unit: 'MKeys/s', divisor: 1_000_000n },
    { unit: 'KKeys/s', divisor: 1_000n },
  ]
  const kps = scaled / 100n
  let unit = 'Keys/s'
  let divisor = 1n
  for (const t of thresholds) {
    if (kps >= t.divisor) { unit = t.unit; divisor = t.divisor; break }
  }
  const valTimes100 = scaled / divisor
  const intPart = valTimes100 / 100n
  const frac = valTimes100 % 100n
  return `${intPart.toString()}.${frac.toString().padStart(2, '0')} ${unit}`
}

function formatTrillionsBI(n: bigint): string {
  const T = 1_000_000_000_000n
  const tInt = n / T
  const rem = n % T
  const twoDec = (rem * 100n) / T
  const intStr = tInt.toString()
  const withCommas = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas}.${twoDec.toString().padStart(2, '0')} TKeys`
}

async function handler(req: NextRequest) {
  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
    }

    const completed = await prisma.blockAssignment.findMany({
      where: { status: 'COMPLETED' },
      include: { blockSolution: true, userToken: true },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
    })

    const agg = new Map<string, MinerAgg>()

    for (const a of completed) {
      const ut = a.userToken
      if (!ut || !a.blockSolution) continue
      const s = parseHexBI(a.startRange)
      const e = parseHexBI(a.endRange)
      if (s === null || e === null || e < s) continue
      const len = e - s
      const startMs = new Date(a.createdAt).getTime()
      const endMs = new Date(a.blockSolution.createdAt).getTime()
      const secs = Math.max(1, Math.floor((endMs - startMs) / 1000))
      const key = ut.id
      const prev = agg.get(key)
      if (!prev) {
        agg.set(key, {
          userTokenId: ut.id,
          token: ut.token,
          bitcoinAddress: ut.bitcoinAddress,
          totalBlocks: 1,
          totalLenBI: len,
          totalSeconds: secs,
          creditsMu: 0,
        })
      } else {
        prev.totalBlocks += 1
        prev.totalLenBI += len
        prev.totalSeconds += secs
      }
    }

    const creditsByUser = await prisma.creditTransaction.groupBy({ by: ['userTokenId'], _sum: { amount: true } })
    let totalMu = 0
    for (const g of creditsByUser) {
      const sum = Number(g._sum.amount || 0)
      const v = sum > 0 ? sum : 0
      totalMu += v
      const rec = agg.get(g.userTokenId)
      if (rec) rec.creditsMu = v
    }

    const miners = Array.from(agg.values()).map(m => {
      const share = totalMu > 0 ? (m.creditsMu / totalMu) * 100 : 0
      return {
        address: m.bitcoinAddress,
        addressShort: shortenMiddle(m.bitcoinAddress, 7, 6),
        token: m.token,
        tokenShort: shortenMiddle(m.token, 6, 6),
        avgSpeedLabel: formatSpeedBI(m.totalLenBI, m.totalSeconds),
        validatedLabel: formatTrillionsBI(m.totalLenBI),
        sharePercent: share,
        sharePercentLabel: `${share.toFixed(2)}%`,
        totalBlocks: m.totalBlocks,
      }
    })

    return new Response(JSON.stringify({ miners }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Miners aggregation error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const GET = rateLimitMiddleware(handler)

