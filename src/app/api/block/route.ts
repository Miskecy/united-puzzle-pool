import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveBlockByToken, setActiveBlock, setBlockExpiration, clearActiveBlock, deleteBlockExpiration, acquireAssignmentLock, releaseAssignmentLock } from '@/lib/redis';
import { calculateExpirationTime, generateCheckworkAddresses, randomBigIntBelow, randomIndexByWeights } from '@/lib/utils';
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

		const workerId = req.nextUrl.searchParams.get('workerId');
		const skipActive = req.nextUrl.searchParams.get('skipActive') === 'true';

		// DELETE: allow user to delete current active block
		if (req.method === 'DELETE') {
			let targetId: string | null = null;
			try {
				const activeBlockId = await getActiveBlockByToken(token, workerId);
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
				await clearActiveBlock(token, workerId);
			} catch { }
			try {
				await deleteBlockExpiration(targetId);
			} catch { }
			return new Response(JSON.stringify({ ok: true, message: 'Active block deleted' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
		}

		// Check if user already has an active block; expire it if needed
		// MOVED TO LATER IN THE FUNCTION (around line 234)
		/*
		let activeBlockId = null;
		if (!skipActive) {
			activeBlockId = await getActiveBlockByToken(token, workerId);
		}

		if (activeBlockId) {
			const existingBlock = await prisma.blockAssignment.findUnique({
				where: { id: activeBlockId },
				include: {
					blockSolution: true,
					userToken: true,
				},
			});

			if (existingBlock) {
				const now = new Date();
				const isExpired = existingBlock.expiresAt && existingBlock.expiresAt < now;
				if (existingBlock.status === 'ACTIVE' && !isExpired) {
					// Check if this block is intended for this worker type
					// If workerId is present (browser), we are good (redis key separation handles it)
					// If workerId is NOT present (manual/GPU), ensure we don't return a small browser block
					// 200000 keys is the fixed browser size. 
					// If a manual worker accidentally picked up a browser block ID from a shared redis key (before the fix),
					// we should filter it out here.
					const isBrowserBlock = (BigInt(existingBlock.endRange) - BigInt(existingBlock.startRange)) <= 200000n;
					const isRequestingBrowser = !!workerId;

					if (!isRequestingBrowser && isBrowserBlock) {
						// This is a manual worker seeing a browser block. Ignore it and clear the redis key so it gets a new one.
						try {
							await clearActiveBlock(token, workerId);
						} catch { }
					} else {
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
				// If the block is expired or not ACTIVE anymore, clear Redis and mark as EXPIRED when applicable
				try {
					await clearActiveBlock(token, workerId);
				} catch { }
				if (existingBlock.status === 'ACTIVE' && isExpired) {
					try {
						await prisma.blockAssignment.update({ where: { id: existingBlock.id }, data: { status: 'EXPIRED' } });
					} catch { }
				}
				try { await deleteBlockExpiration(existingBlock.id); } catch { }
			}
		}
		*/

		// only=true: do not assign, only return if exists
		const only = req.nextUrl.searchParams.get('only') === 'true';
		if (only) {
			// Fallback: check DB for active block if Redis missed
			const dbActive = await prisma.blockAssignment.findMany({
				where: { userTokenId: userToken.id, status: 'ACTIVE' },
				orderBy: { createdAt: 'desc' }
			});

			const isRequestingBrowser = !!workerId;
			const validBlock = dbActive.find(b => {
				try {
					const size = BigInt(b.endRange) - BigInt(b.startRange);
					const isBrowser = size <= 500000n;
					return isRequestingBrowser ? isBrowser : !isBrowser;
				} catch { return false; }
			});

			if (validBlock) {
				return new Response(
					JSON.stringify({
						id: validBlock.id,
						status: 0,
						range: {
							start: validBlock.startRange.replace('0x', '').replace(/^0+/, '') || '0',
							end: validBlock.endRange.replace('0x', '').replace(/^0+/, '') || '0'
						},
						checkwork_addresses: validBlock.checkworkAddresses ? JSON.parse(validBlock.checkworkAddresses) : [],
						expiresAt: validBlock.expiresAt,
						message: `Retrieved existing unchecked block`
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}

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

		try {
			const params = req.nextUrl.searchParams;
			const requested = params.get('length') || params.get('size') || params.get('lenght');
			const customStart = params.get('start');
			const customEnd = params.get('end');
			const forceRandom = params.get('random') === 'true';

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
				const rnd = randomBigIntBelow(span);
				sizeKeys = min + rnd;
			}

			// Enforce hard limit of 1000T (1000 * 10^12)
			const MAX_ALLOWED_SIZE = BigInt('1000000000000000'); 
			if (sizeKeys > MAX_ALLOWED_SIZE) {
				sizeKeys = MAX_ALLOWED_SIZE;
			}

			const sizeClamped = sizeKeys > maxRange ? maxRange : sizeKeys;

			// 4. Se não estiver pulando ativo, verifica se já tem bloco ativo
			let activeBlockId = null;
			if (!skipActive) {
				activeBlockId = await getActiveBlockByToken(token, workerId);
			}

			if (activeBlockId) {
				const existingBlock = await prisma.blockAssignment.findUnique({
					where: { id: activeBlockId },
					include: {
						blockSolution: true,
						userToken: true,
					},
				});

				if (existingBlock) {
					const now = new Date();
					const isExpired = existingBlock.expiresAt && existingBlock.expiresAt < now;
					if (existingBlock.status === 'ACTIVE' && !isExpired) {
						// Check if this block is intended for this worker type
						// If workerId is present (browser), we are good (redis key separation handles it)
						// If workerId is NOT present (manual/GPU), ensure we don't return a small browser block
						// 200000 keys is the fixed browser size. 
						// If a manual worker accidentally picked up a browser block ID from a shared redis key (before the fix),
						// we should filter it out here.
						const isBrowserBlock = (BigInt(existingBlock.endRange) - BigInt(existingBlock.startRange)) <= 200000n;
						const isRequestingBrowser = !!workerId;

						if (!isRequestingBrowser && isBrowserBlock) {
							// This is a manual worker seeing a browser block. Ignore it and clear the redis key so it gets a new one.
							try {
								await clearActiveBlock(token, workerId);
							} catch { }
						} else {
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
					// If the block is expired or not ACTIVE anymore, clear Redis and mark as EXPIRED when applicable
					try {
						await clearActiveBlock(token, workerId);
					} catch { }
					if (existingBlock.status === 'ACTIVE' && isExpired) {
						try {
							await prisma.blockAssignment.update({ where: { id: existingBlock.id }, data: { status: 'EXPIRED' } });
						} catch { }
					}
					try { await deleteBlockExpiration(existingBlock.id); } catch { }
				}
			}

			let reuseSource: { start: bigint; end: bigint } | null = null;
			let hexRange: { start: string; end: string } | null = null;
			let assignedSize: bigint = sizeClamped;
			let freeSegments: { start: bigint; end: bigint }[] = [];
			let containing: { start: bigint; end: bigint } | null = null;

			if (customStart && customEnd) {
				try {
					const s = parseHexBI(customStart) ?? 0n;
					const e = parseHexBI(customEnd) ?? 0n;
					if (e > s) {
						assignedSize = e - s;
						hexRange = {
							start: '0x' + s.toString(16).padStart(64, '0'),
							end: '0x' + e.toString(16).padStart(64, '0')
						};
					}
				} catch { }
			}

			if (!hexRange) {

				// Sweep: mark any ACTIVE blocks past expiresAt as EXPIRED to free ranges
				try {
					await prisma.blockAssignment.updateMany({
						where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
						data: { status: 'EXPIRED' }
					});
				} catch { }
				// Reserve intervals: exclude both COMPLETED (validated) and ACTIVE (currently being worked)
				const reserved = await prisma.blockAssignment.findMany({
					where: { OR: [{ status: 'COMPLETED' }, { status: 'ACTIVE' }] },
					select: { startRange: true, endRange: true },
					orderBy: { startRange: 'asc' }
				});
				const completedIntervals = reserved
					.map((r) => ({ start: BigInt(r.startRange), end: BigInt(r.endRange) }))
					.map(iv => {
						const s = iv.start > puzzleStart ? iv.start : puzzleStart;
						const e = iv.end < puzzleEnd ? iv.end : puzzleEnd;
						return { start: s, end: e };
					})
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
				freeSegments = [];
				let cursor = puzzleStart;
				for (const iv of merged) {
					const segStart = iv.start < puzzleStart ? puzzleStart : iv.start;
					const segEnd = iv.end > puzzleEnd ? puzzleEnd : iv.end;
					if (cursor < segStart) {
						freeSegments.push({ start: cursor, end: segStart });
					}
					if (cursor < segEnd) cursor = segEnd;
					if (cursor >= puzzleEnd) break;
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
				assignedSize = sizeClamped;

				if (!forceRandom) {
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
				}

				// If no expired block selected, choose a fresh segment
				if (chosenStart === null) {
					const candidates = freeSegments
						.map(seg => {
							const s = seg.start < puzzleStart ? puzzleStart : seg.start;
							const e = seg.end > puzzleEnd ? puzzleEnd : seg.end;
							return { start: s, end: e };
						})
						.filter(seg => (seg.end - seg.start) >= sizeClamped);
					if (candidates.length) {
						const weights = candidates.map(seg => {
							const span = seg.end - seg.start - sizeClamped + 1n;
							return span > 0n ? span : 0n;
						});
						const idx = randomIndexByWeights(weights);
						const seg = candidates[idx];
						const span = seg.end - seg.start - sizeClamped + 1n;
						const offset = randomBigIntBelow(span);
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

				// Ensure unique start/end pair: adjust within containing free segment if duplicate is found
				containing = null;
				for (const seg of freeSegments) {
					if (chosenStart! >= seg.start && (chosenStart! + assignedSize) <= seg.end) { containing = seg; break; }
				}
				let proposedStart = chosenStart!;
				// clamp proposedStart inside puzzle bounds
				const maxStart = puzzleEnd - (assignedSize > 0n ? assignedSize : 1n);
				if (proposedStart < puzzleStart) proposedStart = puzzleStart;
				if (proposedStart > maxStart) proposedStart = maxStart;
				hexRange = null;
				for (let attempt = 0; attempt < 50; attempt++) {
					const startHex = '0x' + proposedStart.toString(16).padStart(64, '0');
					const endHex = '0x' + (proposedStart + assignedSize).toString(16).padStart(64, '0');
					const exists = await prisma.blockAssignment.findFirst({ where: { startRange: startHex, endRange: endHex }, select: { id: true } });
					if (!exists) { hexRange = { start: startHex, end: endHex }; break; }
					if (containing) {
						const maxOffset = (containing.end - containing.start) - assignedSize;
						if (maxOffset <= 0n) {
							const span = (containing.end - containing.start) - assignedSize + 1n;
							const offset = randomBigIntBelow(span > 0n ? span : 1n);
							proposedStart = containing.start + offset;
						} else {
							const offset = BigInt(attempt + 1);
							if (offset > maxOffset) {
								const span = maxOffset + 1n;
								proposedStart = containing.start + randomBigIntBelow(span);
							} else {
								proposedStart = proposedStart + 1n;
							}
						}
					} else {
						const seg = freeSegments[Math.floor(Math.random() * freeSegments.length)];
						const span = seg.end - seg.start - assignedSize + 1n;
						const offset = randomBigIntBelow(span > 0n ? span : 1n);
						proposedStart = seg.start + offset;
					}
					// clamp proposedStart inside puzzle bounds on each attempt
					if (proposedStart < puzzleStart) proposedStart = puzzleStart;
					if (proposedStart > maxStart) proposedStart = maxStart;
				}
				if (!hexRange) {
					const startHex = '0x' + proposedStart.toString(16).padStart(64, '0');
					const endHex = '0x' + (proposedStart + assignedSize).toString(16).padStart(64, '0');
					hexRange = { start: startHex, end: endHex };
				}
			} // Close if (!hexRange)

			if (!hexRange) throw new Error('Failed to allocate block range');

			// Generate checkwork addresses with dynamic count near range end
			console.log('Generating checkwork addresses...');
			const desiredCount = assignedSize < 10n ? Number(assignedSize) : 10;
			const checkworkAddresses = generateCheckworkAddresses(hexRange.start, hexRange.end, desiredCount);
			console.log('Checkwork addresses generated:', checkworkAddresses.length, checkworkAddresses);

			// Basic validation: ensure we have at least one unique address
			const uniqueAddresses = new Set(checkworkAddresses);
			if (uniqueAddresses.size < 1) {
				console.error('Erro: nenhum endereço gerado');
				return new Response(
					JSON.stringify({ error: 'Falha ao gerar endereços Bitcoin' }),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}

			const isBrowserWorker = workerId && workerId.startsWith('browser-');
			let expiresAt: Date;
			if (isBrowserWorker) {
				// 10 minutes for browser miners
				expiresAt = new Date(Date.now() + 10 * 60 * 1000);
			} else {
				// 12 hours for others
				expiresAt = calculateExpirationTime(12);
			}

			// Create block assignment with retry on uniqueness
			let blockAssignment: { id: string; startRange: string; endRange: string; checkworkAddresses: string; expiresAt: Date } | undefined;
			for (let attempt = 0; attempt < 5; attempt++) {
				try {
					blockAssignment = await prisma.blockAssignment.create({
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
					break;
				} catch {
					if (!freeSegments || freeSegments.length === 0) break;
					let seg = containing;
					if (!seg) {
						const valid = freeSegments
							.map(s => ({ start: s.start < puzzleStart ? puzzleStart : s.start, end: s.end > puzzleEnd ? puzzleEnd : s.end }))
							.filter(s => (s.end - s.start) >= assignedSize);
						if (valid.length) {
							const weights = valid.map(s => {
								const sp = s.end - s.start - assignedSize + 1n;
								return sp > 0n ? sp : 0n;
							});
							const i = randomIndexByWeights(weights);
							seg = valid[i];
						} else {
							seg = freeSegments[Math.floor(Math.random() * freeSegments.length)];
						}
					}
					let newStart = seg.start + randomBigIntBelow((seg.end - seg.start - assignedSize + 1n) > 0n ? (seg.end - seg.start - assignedSize + 1n) : 1n);
					const maxStart2 = puzzleEnd - (assignedSize > 0n ? assignedSize : 1n);
					if (newStart < puzzleStart) newStart = puzzleStart;
					if (newStart > maxStart2) newStart = maxStart2;
					hexRange = {
						start: '0x' + newStart.toString(16).padStart(64, '0'),
						end: '0x' + (newStart + assignedSize).toString(16).padStart(64, '0')
					};
				}
			}
			if (!blockAssignment) {
				return new Response(
					JSON.stringify({ error: 'Failed to create unique block assignment' }),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}

			await setBlockExpiration(blockAssignment.id, expiresAt);

			// If it's a browser miner, set a short TTL (10 mins) for the active block reference
			const isBrowser = workerId && workerId.startsWith('browser-');
			const ttl = isBrowser ? 600 : undefined;

			await setActiveBlock(token, blockAssignment.id, workerId, ttl);

			const assignedMsg = (typeof reuseSource !== 'undefined' && reuseSource)
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
