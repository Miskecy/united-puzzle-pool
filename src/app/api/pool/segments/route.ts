import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { loadPuzzleConfig } from '@/lib/config';

function parseHexBI(hex: string | undefined): bigint | null {
	if (!hex) return null;
	const clean = hex.replace(/^0x/, '');
	try { return BigInt(`0x${clean}`); } catch { return null; }
}

function categorizeLen(len: bigint): { label: string; color: string } {
	const B = 1_000_000_000n;
	const T = 1_000_000_000_000n;
	if (len <= 10n * B) return { label: '≤10B', color: 'bg-blue-400' };
	if (len <= 250n * B) return { label: '≤250B', color: 'bg-cyan-500' };
	if (len <= 1n * T) return { label: '≤1T', color: 'bg-green-500' };
	if (len <= 10n * T) return { label: '≤10T', color: 'bg-amber-500' };
	if (len <= 20n * T) return { label: '≤20T', color: 'bg-orange-600' };
	if (len >= 100n * T) return { label: '≥100T+', color: 'bg-red-600' };
	return { label: '20–100T', color: 'bg-orange-400' };
}

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
		}

		const cfg = await loadPuzzleConfig();
		if (!cfg) {
			return new Response(JSON.stringify({ error: 'Puzzle configuration missing' }), { status: 404 });
		}

		const puzzleStart = parseHexBI(cfg.startHex) ?? 0n;
		const puzzleEndDefault = 1n << 71n;
		const puzzleEnd = parseHexBI(cfg.endHex) ?? puzzleEndDefault;
		if (puzzleEnd <= puzzleStart) {
			return new Response(JSON.stringify({ error: 'Invalid puzzle range' }), { status: 400 });
		}
		const fullLen = puzzleEnd - puzzleStart;

		const url = req.nextUrl;
		const daysParam = Number(url.searchParams.get('days') || 0);
		const maxParam = Number(url.searchParams.get('max') || 0);
		const days = (isFinite(daysParam) && daysParam > 0 && daysParam <= 365) ? daysParam : 0;
		const MAX_READ = (isFinite(maxParam) && maxParam > 0 && maxParam <= 200000) ? maxParam : 50000;
		const thresholdDate = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

		const assignments = await prisma.blockAssignment.findMany({
			where: days > 0
				? { status: 'COMPLETED', blockSolution: { is: { createdAt: { gte: thresholdDate! } } } }
				: { status: 'COMPLETED' },
			select: { startRange: true, endRange: true },
			orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
			take: MAX_READ,
		});

		const intervals: Array<{ s: bigint; e: bigint; len: bigint }> = [];
		const categoryLegend: Record<string, { color: string; count: number }> = {};

		for (const a of assignments) {
			const s = parseHexBI(a.startRange);
			const e = parseHexBI(a.endRange);
			if (s === null || e === null) continue;
			const start = s > puzzleStart ? s : puzzleStart;
			const end = e < puzzleEnd ? e : puzzleEnd;
			if (end <= start) continue;
			const len = end - start;
			intervals.push({ s: start, e: end, len });
			const cat = categorizeLen(len);
			categoryLegend[cat.label] = { color: cat.color, count: (categoryLegend[cat.label]?.count || 0) + 1 };
		}

		if (intervals.length === 0) {
			return new Response(JSON.stringify({ segments: [], legend: [] }), { status: 200 });
		}

		intervals.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
		const union: Array<{ s: bigint; e: bigint }> = [];
		let curS = intervals[0].s;
		let curE = intervals[0].e;
		for (let i = 1; i < intervals.length; i++) {
			const it = intervals[i];
			if (it.s <= curE) {
				if (it.e > curE) curE = it.e;
			} else {
				union.push({ s: curS, e: curE });
				curS = it.s;
				curE = it.e;
			}
		}
		union.push({ s: curS, e: curE });

		const segmentsRaw = union.map(u => {
			const len = u.e - u.s;
			const cat = categorizeLen(len);
			const leftPct = Number(((u.s - puzzleStart) * 10000n) / fullLen) / 100;
			const widthPct = Number((len * 10000n) / fullLen) / 100;
			return { leftPct, widthPct, color: cat.color, label: cat.label };
		});

		const MAX_SEGMENTS = 1000;
		let segments = segmentsRaw;
		if (segments.length > MAX_SEGMENTS) {
			const factor = Math.ceil(segments.length / MAX_SEGMENTS);
			const reduced: typeof segments = [];
			for (let i = 0; i < segments.length; i += factor) {
				const chunk = segments.slice(i, i + factor);
				const left = chunk[0].leftPct;
				const right = chunk[chunk.length - 1].leftPct + chunk[chunk.length - 1].widthPct;
				const width = Math.max(0, right - left);
				const color = chunk[Math.floor(chunk.length / 2)].color;
				const label = chunk[Math.floor(chunk.length / 2)].label;
				reduced.push({ leftPct: left, widthPct: width, color, label });
			}
			segments = reduced;
		}

		const legend = Object.entries(categoryLegend).map(([label, v]) => ({ label, color: v.color, count: v.count }))
			.sort((a, b) => a.label.localeCompare(b.label));

		return new Response(JSON.stringify({ segments, legend }), { status: 200, headers: { 'Content-Type': 'application/json' } });
	} catch (error) {
		console.error('Segments aggregation error:', error);
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
	}
}

export const GET = rateLimitMiddleware(handler);
