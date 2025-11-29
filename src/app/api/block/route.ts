import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveBlockByToken, setActiveBlock, setBlockExpiration, clearActiveBlock, deleteBlockExpiration, acquireAssignmentLock, releaseAssignmentLock } from '@/lib/redis';
import { calculateExpirationTime, generateCheckworkAddresses } from '@/lib/utils';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { loadPuzzleConfig, parseHexBI } from '@/lib/config';

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET' && req.method !== 'DELETE') {
			return new Response(
				JSON.stringify({ error: 'Method not allowed' }),
				{ status: 405, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Get token from header
		const token = req.headers.get('pool-token');
		if (!token) {
			return new Response(
				JSON.stringify({ error: 'Missing pool-token header' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Verify token exists
		const userToken = await prisma.userToken.findUnique({
			where: { token },
		});

		if (!userToken) {
			return new Response(
				JSON.stringify({ error: 'Invalid token' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// DELETE: allow user to delete current active block
		if (req.method === 'DELETE') {
			let targetId: string | null = null;
			try {
				const activeBlockId = await getActiveBlockByToken(token);
				if (activeBlockId) targetId = activeBlockId;
			} catch { }
			if (!targetId) {
				const latestActive = await prisma.blockAssignment.findFirst({
					where: { userTokenId: userToken.id, status: 'ACTIVE' },
					orderBy: { createdAt: 'desc' },
				});
				targetId = latestActive?.id || null;
			}
			if (!targetId) {
				return new Response(JSON.stringify({ error: 'No active block to delete' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
			}
			await prisma.blockAssignment.update({ where: { id: targetId }, data: { status: 'EXPIRED', expiresAt: new Date() } });
			try {
				await clearActiveBlock(token);
			} catch { }
			try {
				await deleteBlockExpiration(targetId);
			} catch { }
			return new Response(JSON.stringify({ ok: true, message: 'Active block deleted' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
		}

		// Check if user already has an active block
		const activeBlockId = await getActiveBlockByToken(token);
		if (activeBlockId) {
			const existingBlock = await prisma.blockAssignment.findUnique({
				where: { id: activeBlockId },
				include: {
					blockSolution: true,
				},
			});

			if (existingBlock && existingBlock.status === 'ACTIVE') {
				return new Response(
					JSON.stringify({
						id: existingBlock.id,
						status: 0,
						range: {
							start: existingBlock.startRange.replace('0x', '').replace(/^0+/, '') || '0',
							end: existingBlock.endRange.replace('0x', '').replace(/^0+/, '') || '0'
						},
						checkwork_addresses: JSON.parse(existingBlock.checkworkAddresses),
						expiresAt: existingBlock.expiresAt,
						message: `Retrieved existing unchecked block`
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		// only=true: do not assign, only return if exists
		const only = req.nextUrl.searchParams.get('only') === 'true';
		if (only) {
			return new Response(
				JSON.stringify({ error: 'No active block' }),
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}

		let lockToken: string | null = null;
		{
			const startWait = Date.now();
			const maxWaitMs = 2000;
			while (Date.now() - startWait < maxWaitMs) {
				lockToken = await acquireAssignmentLock();
				if (lockToken) break;
				await new Promise((r) => setTimeout(r, 100 + Math.floor(Math.random() * 100)));
			}
			if (!lockToken) {
				return new Response(
					JSON.stringify({ error: 'Service busy, retry later' }),
					{ status: 503, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		const params = req.nextUrl.searchParams;
		const requested = params.get('length') || params.get('size') || params.get('lenght');
		function parseLength(v?: string | null): bigint {
			if (!v) return BigInt('1000000000000');
			const s = v.trim().toUpperCase();
			const m = s.match(/^(\d+)([KMBT]?)$/);
			if (!m) return BigInt('1000000000000');
			const n = BigInt(m[1]);
			const suf = m[2];
			if (suf === 'K') return n * BigInt(1000);
			if (suf === 'M') return n * BigInt(1000000);
			if (suf === 'B') return n * BigInt(1000000000);
			if (suf === 'T') return n * BigInt(1000000000000);
			return n;
		}

		// Resolve puzzle bounds from DB (fallback to defaults)
		try {
			const cfg = await loadPuzzleConfig();
			if (!cfg) {
				return new Response(
					JSON.stringify({ error: 'Puzzle configuration missing' }),
					{ status: 409, headers: { 'Content-Type': 'application/json' } }
				);
			}
			const DEFAULT_TOTAL_SPACE = 1n << 71n;
			const puzzleStart = parseHexBI(cfg.startHex) ?? 0n;
			const puzzleEnd = parseHexBI(cfg.endHex) ?? DEFAULT_TOTAL_SPACE;
			const maxRange = puzzleEnd - puzzleStart;

			// Determine target block size: request param overrides, otherwise random between env min/max
			const envMin = process.env.BLOCK_RANGE_MIN_KEYS ? parseLength(process.env.BLOCK_RANGE_MIN_KEYS) : BigInt('1000000000000');
			const envMax = process.env.BLOCK_RANGE_MAX_KEYS ? parseLength(process.env.BLOCK_RANGE_MAX_KEYS) : envMin;
			let sizeKeys = requested ? parseLength(requested) : envMin;
			if (!requested) {
				const min = envMin < 1n ? 1n : envMin;
				const max = envMax < min ? min : envMax;
				const span = max - min + 1n;
				const rnd = BigInt(Math.floor(Math.random() * Number(span)));
				sizeKeys = min + rnd;
			}
			const sizeClamped = sizeKeys > maxRange ? maxRange : sizeKeys;
			// Reserve intervals: exclude both COMPLETED (validated) and ACTIVE (currently being worked)
			const reserved = await prisma.blockAssignment.findMany({
				where: { OR: [{ status: 'COMPLETED' }, { status: 'ACTIVE' }] },
				select: { startRange: true, endRange: true },
				orderBy: { startRange: 'asc' }
			});
			const completedIntervals = reserved
				.map((r) => ({ start: BigInt(r.startRange), end: BigInt(r.endRange) }))
				.filter(iv => iv.start < iv.end)
				.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

			// Merge overlapping completed intervals
			const merged: { start: bigint; end: bigint }[] = [];
			for (const iv of completedIntervals) {
				if (!merged.length) { merged.push({ ...iv }); continue; }
				const last = merged[merged.length - 1];
				if (iv.start <= last.end) {
					if (iv.end > last.end) last.end = iv.end;
				} else {
					merged.push({ ...iv });
				}
			}

			// Compute free segments within [puzzleStart, puzzleEnd)
			const freeSegments: { start: bigint; end: bigint }[] = [];
			let cursor = puzzleStart;
			for (const iv of merged) {
				if (cursor < iv.start) {
					freeSegments.push({ start: cursor, end: iv.start });
				}
				if (cursor < iv.end) cursor = iv.end;
			}
			if (cursor < puzzleEnd) freeSegments.push({ start: cursor, end: puzzleEnd });

			// If nothing is free, all blocks are solved
			const totalFree = freeSegments.reduce((acc, seg) => acc + (seg.end - seg.start), 0n);
			if (totalFree <= 0n) {
				return new Response(
					JSON.stringify({ error: 'All blocks are solved' }),
					{ status: 409, headers: { 'Content-Type': 'application/json' } }
				);
			}

			// First attempt: reuse an expired block with same/similar length that fits within free segments
			let chosenStart: bigint | null = null;
			let assignedSize: bigint = sizeClamped;
			let reuseSource: { start: bigint; end: bigint } | null = null;
			try {
				const expired = await prisma.blockAssignment.findMany({
					where: { status: 'EXPIRED' },
					select: { startRange: true, endRange: true },
					orderBy: { updatedAt: 'asc' },
					take: 200,
				});
				const expiredParsed = expired
					.map(e => ({ start: BigInt(e.startRange), end: BigInt(e.endRange) }))
					.filter(iv => iv.start < iv.end);
				const low = (sizeClamped * 1n) / 2n;
				const high = sizeClamped + (sizeClamped / 2n);
				let bestStart: bigint | null = null;
				let bestLen: bigint = 0n;
				let bestDiff: bigint | null = null;
				for (const iv of expiredParsed) {
					for (const seg of freeSegments) {
						const s = iv.start > seg.start ? iv.start : seg.start;
						const e = iv.end < seg.end ? iv.end : seg.end;
						if (e <= s) continue;
						const interLen = e - s;
						if (interLen < low) continue;
						let candidateLen = sizeClamped;
						if (candidateLen < low) candidateLen = low;
						const maxAllowed = interLen < high ? interLen : high;
						if (candidateLen > maxAllowed) candidateLen = maxAllowed;
						const diff = candidateLen > sizeClamped ? (candidateLen - sizeClamped) : (sizeClamped - candidateLen);
						if (bestDiff === null || diff < bestDiff || (diff === bestDiff && candidateLen > bestLen)) {
							bestStart = s;
							bestLen = candidateLen;
							bestDiff = diff;
							reuseSource = iv;
						}
					}
				}
				if (bestStart !== null) {
					chosenStart = bestStart;
					assignedSize = bestLen;
				}
			} catch { }

			// If no expired block selected, choose a fresh segment
			if (chosenStart === null) {
				const candidates = freeSegments.filter(seg => (seg.end - seg.start) >= sizeClamped);
				if (candidates.length) {
					const seg = candidates[Math.floor(Math.random() * candidates.length)];
					const span = seg.end - seg.start - sizeClamped + 1n;
					const offset = BigInt(Math.floor(Math.random() * Number(span)));
					chosenStart = seg.start + offset;
					assignedSize = sizeClamped;
				} else {
					// Fallback: choose the largest free segment and shrink size to fit
					let largest = freeSegments[0];
					for (const seg of freeSegments) {
						if ((seg.end - seg.start) > (largest.end - largest.start)) largest = seg;
					}
					const largestLen = largest.end - largest.start;
					assignedSize = largestLen > 0n ? largestLen : 1n;
					chosenStart = largest.start;
				}
			}

			const start = '0x' + chosenStart!.toString(16).padStart(64, '0');
			const end = '0x' + (chosenStart! + assignedSize).toString(16).padStart(64, '0');
			const hexRange = { start, end };

			// Generate checkwork addresses using the new function
			console.log('Generating checkwork addresses...');
			const checkworkAddresses = generateCheckworkAddresses(hexRange.start, hexRange.end, 10);
			console.log('Checkwork addresses generated:', checkworkAddresses.length, checkworkAddresses);

			// Validate that we have exactly 10 unique addresses
			if (checkworkAddresses.length !== 10) {
				console.error(`Erro: esperado 10 endereços, mas foram gerados ${checkworkAddresses.length}`);
				return new Response(
					JSON.stringify({ error: 'Falha ao gerar endereços Bitcoin' }),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}

			// Check for duplicate addresses
			const uniqueAddresses = new Set(checkworkAddresses);
			if (uniqueAddresses.size !== checkworkAddresses.length) {
				console.error('Erro: endereços duplicados detectados');
				return new Response(
					JSON.stringify({ error: 'Endereços Bitcoin duplicados gerados' }),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}

			const expiresAt = calculateExpirationTime(12);

			// Create block assignment
			const blockAssignment = await prisma.blockAssignment.create({
				data: {
					userTokenId: userToken.id,
					startRange: hexRange.start,
					endRange: hexRange.end,
					checkworkAddresses: JSON.stringify(checkworkAddresses),
					puzzleAddressSnapshot: cfg.address,
					puzzleNameSnapshot: cfg.name || null,
					expiresAt,
					status: 'ACTIVE',
				},
			});

			await setBlockExpiration(blockAssignment.id, expiresAt);
			await setActiveBlock(token, blockAssignment.id);

			const assignedMsg = reuseSource
				? `Reassigned expired block`
				: (assignedSize !== sizeClamped)
					? `New block assigned with adjusted size`
					: `New block assigned successfully`;
			return new Response(
				JSON.stringify({
					id: blockAssignment.id,
					status: 0,
					range: {
						start: blockAssignment.startRange.replace('0x', '').replace(/^0+/, '') || '0',
						end: blockAssignment.endRange.replace('0x', '').replace(/^0+/, '') || '0'
					},
					checkwork_addresses: JSON.parse(blockAssignment.checkworkAddresses),
					expiresAt: blockAssignment.expiresAt,
					message: assignedMsg
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		} finally {
			if (lockToken) {
				await releaseAssignmentLock(lockToken);
			}
		}

	} catch (error) {
		console.error('Block assignment error:', error);
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export const GET = rateLimitMiddleware(handler);
export const DELETE = rateLimitMiddleware(handler);
