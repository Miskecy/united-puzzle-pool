import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { loadPuzzleConfig } from '@/lib/config';

type BinStat = {
	index: number;
	startHex: string;
	endHex: string;
	total: number;
	completed: number;
	percent: number;
};

function toHex(big: bigint): string {
	return `0x${big.toString(16)}`;
}

function parseHexBI(hex: string | undefined): bigint | null {
	if (!hex) return null;
	const clean = hex.replace(/^0x/, '');
	try { return BigInt(`0x${clean}`); } catch { return null; }
}

function intersectLen(aStart: bigint, aEnd: bigint, bStart: bigint, bEnd: bigint): bigint {
	const start = aStart > bStart ? aStart : bStart;
	const end = aEnd < bEnd ? aEnd : bEnd;
	if (end <= start) return 0n;
	return (end - start);
}

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(
				JSON.stringify({ error: 'Method not allowed' }),
				{ status: 405, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const DEFAULT_TOTAL_SPACE = 1n << 71n;

		const cfg = await loadPuzzleConfig();
		if (!cfg) {
			return new Response(
				JSON.stringify({ error: 'Puzzle configuration missing' }),
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}
		const puzzleStart = parseHexBI(cfg.startHex) ?? 0n;
		const puzzleEnd = parseHexBI(cfg.endHex) ?? DEFAULT_TOTAL_SPACE;

		if (puzzleStart < 0n || puzzleEnd < 0n || puzzleEnd < puzzleStart) {
			return new Response(
				JSON.stringify({ error: 'Invalid puzzle range configuration' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const PUZZLE_LEN = puzzleEnd - puzzleStart;
		if (PUZZLE_LEN <= 0n) {
			return new Response(
				JSON.stringify({ error: 'Empty puzzle range' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const maxExp = puzzleEnd > 0n ? puzzleEnd.toString(2).length : 1;
		const BIN_COUNT = Math.max(1, Math.min(256, maxExp));

		const baseChunk = PUZZLE_LEN / BigInt(BIN_COUNT);
		const remainder = PUZZLE_LEN % BigInt(BIN_COUNT);
		const bins: BinStat[] = [];
		let cursor = puzzleStart;
		for (let i = 0; i < BIN_COUNT; i++) {
			const extra = i < Number(remainder) ? 1n : 0n;
			const size = baseChunk + extra;
			const start = cursor;
			const end = start + size;
			const targetLen = end >= start ? (end - start) : 0n;
			bins.push({
				index: i,
				startHex: toHex(start),
				endHex: toHex(end),
				total: Number(targetLen),
				completed: 0,
				percent: 0,
			});
			cursor = end;
		}

		const assignments = await prisma.blockAssignment.findMany({
			select: { startRange: true, endRange: true, status: true },
			orderBy: { createdAt: 'desc' },
			take: 50_000,
		});

		for (const a of assignments) {
			const s = parseHexBI(a.startRange);
			const e = parseHexBI(a.endRange);
			if (s === null || e === null) continue;
			const aTargetLen = intersectLen(s, e, puzzleStart, puzzleEnd);
			if (aTargetLen === 0n) continue;
			if (a.status !== 'COMPLETED') continue;
			// Add intersection to each bin it touches
			for (let i = 0; i < bins.length; i++) {
				const binStart = parseHexBI(bins[i].startHex)!;
				const binEnd = parseHexBI(bins[i].endHex)!;
				const inc = intersectLen(s, e, binStart, binEnd);
				if (inc === 0n) continue;
				const remaining = Math.max(0, bins[i].total - bins[i].completed);
				const add = Number(inc) > remaining ? remaining : Number(inc);
				bins[i].completed += add;
			}
		}

		for (const b of bins) {
			b.percent = b.total > 0 ? Math.min(100, Math.round((b.completed / b.total) * 100)) : 0;
		}

		const meta = {
			puzzleStart: toHex(puzzleStart),
			puzzleEnd: toHex(puzzleEnd),
			binCount: BIN_COUNT,
			maxExp,
			spanExp: PUZZLE_LEN > 0n ? PUZZLE_LEN.toString(2).length : 0,
			address: cfg.address ?? null,
		};

		return new Response(
			JSON.stringify({ bins, meta }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('Pool overview error:', error);
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export const GET = rateLimitMiddleware(handler);
