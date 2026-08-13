import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveBlockByToken, clearActiveBlock, incrementBlockSubmitFailures, deleteBlockSubmitFailures, invalidateCompletedIntervals, acquireSubmitLock } from '@/lib/redis';
import CoinKey from 'coinkey';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { loadPuzzleConfig } from '@/lib/config';

interface BlockSubmissionRequest {
	privateKeys: string[];
	blockId?: string;
	workerId?: string;
}

// Helper function to strip 0x prefix from hex strings
function stripHexPrefix(hex: string): string {
	return hex.startsWith('0x') ? hex.slice(2) : hex;
}

// Retry helper: catches P1008 (timeout) and P2034 (write conflict) with exponential backoff.
// P2034 can occur under SQLite WAL contention; P1008 when the busy_timeout is exceeded.
const withRetries = async <T>(fn: () => Promise<T>): Promise<T> => {
	const maxAttempts = 5;
	let delay = 150;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			const code = (err as { code?: string }).code;
			const retryable = code === 'P1008' || code === 'P2034';
			if (retryable && attempt < maxAttempts - 1) {
				await new Promise(r => setTimeout(r, delay + Math.floor(Math.random() * delay)));
				delay = Math.min(delay * 2, 2000);
				continue;
			}
			throw err;
		}
	}
	throw new Error('unreachable');
};

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'POST') {
			return new Response(
				JSON.stringify({ error: 'Method not allowed' }),
				{ status: 405, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 1. Validação do Token
		const token = req.headers.get('pool-token');
		if (!token) {
			return new Response(
				JSON.stringify({ error: 'Missing pool-token header' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 2. Parse e Validação do Body
		let body: BlockSubmissionRequest;
		try {
			body = await req.json();
		} catch {
			return new Response(
				JSON.stringify({ error: 'Invalid JSON body' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (!body.privateKeys || !Array.isArray(body.privateKeys) || body.privateKeys.length === 0) {
			return new Response(
				JSON.stringify({ error: 'At least 1 private key must be provided' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}
		if (body.privateKeys.length > 30) {
			body.privateKeys = body.privateKeys.slice(0, 30);
		}

		for (const key of body.privateKeys) {
			if (typeof key !== 'string') {
				return new Response(
					JSON.stringify({ error: 'All private keys must be strings' }),
					{ status: 400, headers: { 'Content-Type': 'application/json' } }
				);
			}

			const cleanKey = stripHexPrefix(key);
			if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
				return new Response(
					JSON.stringify({ error: 'Invalid private key format. Must be 64 hex characters (with or without 0x prefix)' }),
					{ status: 400, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		// 3. Verificação do Token
		const userToken = await prisma.userToken.findUnique({
			where: { token },
		});

		if (!userToken) {
			return new Response(
				JSON.stringify({ error: 'Invalid token' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 4. Determinar Block ID Alvo
		let targetBlockId: string | null = null;
		if (body.blockId) {
			targetBlockId = body.blockId;
		} else {
			// Fallback para Redis
			let activeBlockId: string | null = null;
			try {
				const fromRedis = await getActiveBlockByToken(token, body.workerId);
				if (fromRedis) activeBlockId = fromRedis;
			} catch { }
			if (activeBlockId) {
				targetBlockId = activeBlockId;
			} else {
				// Fallback para DB
				const latestActive = await prisma.blockAssignment.findFirst({
					where: { userTokenId: userToken.id, status: 'ACTIVE' },
					orderBy: { createdAt: 'desc' },
				});
				targetBlockId = latestActive?.id || null;
			}
		}

		if (!targetBlockId) {
			return new Response(
				JSON.stringify({ error: 'No target block found for submission (provide blockId or have an active block)' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 5. Verificação do Block Assignment
		const blockAssignment = await prisma.blockAssignment.findUnique({
			where: { id: targetBlockId },
		});

		// Check ownership immediately
		if (!blockAssignment || blockAssignment.userTokenId !== userToken.id) {
			const error = !blockAssignment
				? 'Block not found'
				: 'Block does not belong to this token';
			return new Response(
				JSON.stringify({ error }),
				{ status: blockAssignment ? 400 : 404, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 6. Validação das Chaves Privadas (Antecipada para verificar Puzzle Key)
		const checkworkAddresses = JSON.parse(blockAssignment.checkworkAddresses) as string[];
		// When stored private keys are available, use direct comparison (eliminates any
		// address-derivation format mismatch between server and GPU worker).
		const storedPrivateKeys: string[] | null = blockAssignment.checkworkPrivateKeys
			? (JSON.parse(blockAssignment.checkworkPrivateKeys) as string[])
			: null;
		const storedKeySet = storedPrivateKeys
			? new Set(storedPrivateKeys.map(k => k.toLowerCase()))
			: null;

		const derivedAddresses: string[] = [];
		const results: { privateKey: string; address: string; isValid: boolean }[] = [];

		for (let i = 0; i < body.privateKeys.length; i++) {
			try {
				const cleanPrivateKey = stripHexPrefix(body.privateKeys[i]);
				// Always derive address for response detail and puzzle detection
				const ck = new CoinKey(Buffer.from(cleanPrivateKey, 'hex'));
				(ck as unknown as { compressed?: boolean }).compressed = true;
				const address = ck.publicAddress;
				derivedAddresses.push(address);
				const isValid = storedKeySet
					? storedKeySet.has(cleanPrivateKey.toLowerCase())
					: new Set(checkworkAddresses).has(address);
				results.push({ privateKey: body.privateKeys[i], address, isValid });
			} catch {
				results.push({
					privateKey: body.privateKeys[i],
					address: '',
					isValid: false,
				});
			}
		}

		const derivedAddressesSet = new Set(derivedAddresses);
		const missingAddresses = checkworkAddresses.filter(a => !derivedAddressesSet.has(a));
		// allCorrect: when stored keys exist, every stored key must appear in the submission;
		// otherwise fall back to the address-coverage check.
		const allCorrect = storedKeySet
			? [...storedKeySet].every(k => new Set(body.privateKeys.map(p => stripHexPrefix(p).toLowerCase())).has(k))
			: missingAddresses.length === 0;

		const cfg = await loadPuzzleConfig();
		const puzzleAddress = cfg?.address ?? null;
		const puzzleDetected = !!puzzleAddress && derivedAddressesSet.has(puzzleAddress);
		const puzzlePrivateKeyValue =
			puzzleDetected && puzzleAddress
				? (() => {
					const idx = derivedAddresses.findIndex(a => a === puzzleAddress);
					return idx >= 0 ? body.privateKeys[idx] : null;
				})()
				: null;

		// Check Status - Allow EXPIRED if puzzle key is found
		if (blockAssignment.status !== 'ACTIVE' && !puzzleDetected) {
			return new Response(
				JSON.stringify({ error: 'Block already completed or expired' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Idempotency lock: prevent the same block from being submitted twice concurrently
		// (e.g. browser retry on network timeout → double credit transaction).
		// The lock TTL matches the block solution's lifetime in the DB (5 min is plenty).
		if (allCorrect || puzzleDetected) {
			const canProceed = await acquireSubmitLock(blockAssignment.id);
			if (!canProceed) {
				return new Response(
					JSON.stringify({ error: 'Submission already in progress for this block, retry in a moment' }),
					{ status: 409, headers: { 'Content-Type': 'application/json', 'Retry-After': '2' } }
				);
			}
		}

		if (!allCorrect && !puzzleDetected) {
			// Track consecutive failures for this block. After 3 failures the block is
			// almost certainly stuck (worker found wrong keys or has a range bug), so
			// auto-expire it and clear Redis so the worker can fetch a fresh block
			// instead of looping forever on the same broken assignment.
			let failCount = 0;
			try { failCount = await incrementBlockSubmitFailures(blockAssignment.id); } catch { }
			// autoReleased is only true when the DB update actually succeeded.
			// Each operation is tried individually so a Redis failure does not prevent
			// the DB expiry (and vice versa), and the flag is not set when the block
			// was not actually expired (which would leave the worker stuck believing it
			// had a fresh assignment when the old ACTIVE block was still in the DB).
			let autoReleased = false;
			if (failCount >= 3) {
				try {
					await prisma.blockAssignment.update({
						where: { id: blockAssignment.id },
						data: { status: 'EXPIRED', expiresAt: new Date() },
					});
					autoReleased = true;
				} catch { }
				if (autoReleased) {
					// Clear the workerId-specific Redis key used during block fetch
					try { await clearActiveBlock(token, body.workerId); } catch { }
					// Also clear the global (no-workerId) key in case fetch used a
					// different workerId than the one in the submit body
					if (body.workerId) {
						try { await clearActiveBlock(token, null); } catch { }
					}
					try { await deleteBlockSubmitFailures(blockAssignment.id); } catch { }
				}
			}
			return new Response(
				JSON.stringify({
					error: 'Not all private keys are correct',
					details: {
						expected: checkworkAddresses,
						derived: derivedAddresses,
						missing: missingAddresses,
					},
					results,
					autoReleased,
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 7. Cálculo de Créditos (1 crédito por 1T, com frações de 0.001 por 1B)
		const startBig = BigInt(blockAssignment.startRange);
		const endBig = BigInt(blockAssignment.endRange);
		const keysValidated = endBig - startBig;
		const T = 1_000_000_000_000n;
		const creditsMillis = keysValidated > 0n ? Number((keysValidated * 1000n) / T) : 0;

		console.log('Submitting block', { blockId: blockAssignment.id, token });

		// 8. ATUALIZAÇÕES DO BANCO DE DADOS EM TRANSAÇÃO (Melhoria de Performance)
		await withRetries(() =>
			prisma.$transaction([
				// Atualiza o status do Block Assignment
				prisma.blockAssignment.update({
					where: { id: blockAssignment.id },
					data: { status: 'COMPLETED' },
				}),
				// Salva a solução
				prisma.blockSolution.upsert({
					where: { blockAssignmentId: blockAssignment.id },
					update: {
						privateKeys: JSON.stringify(body.privateKeys),
						creditsAwarded: creditsMillis,
						puzzlePrivateKey: puzzlePrivateKeyValue ?? undefined,
					},
					create: {
						blockAssignmentId: blockAssignment.id,
						privateKeys: JSON.stringify(body.privateKeys),
						creditsAwarded: creditsMillis,
						puzzlePrivateKey: puzzlePrivateKeyValue,
					},
				}),
				...(puzzleDetected && puzzleAddress && puzzlePrivateKeyValue ? [
					prisma.puzzleConfig.updateMany({
						where: { active: true },
						data: {
							solved: true,
							puzzlePrivateKey: puzzlePrivateKeyValue,
						}
					})
				] : []),
				// Cria a transação de crédito
				prisma.creditTransaction.create({
					data: {
						userTokenId: userToken.id,
						type: 'EARNED',
						amount: creditsMillis,
						description: `Block ${blockAssignment.id} completed`,
					},
				}),
			])
		);

		// Invalidate the COMPLETED intervals cache so next GET /block sees this block as reserved
		invalidateCompletedIntervals().catch(() => {});

		// 9. Limpar o bloco ativo do Redis e contador de falhas
		try {
			const currentActive = await getActiveBlockByToken(token, body.workerId);
			if (currentActive === blockAssignment.id) {
				await clearActiveBlock(token, body.workerId);
			}
		} catch { }
		try { await deleteBlockSubmitFailures(blockAssignment.id); } catch { }

		// 10. Resposta de Sucesso
		const addressMap = derivedAddresses.map((addr, idx) => ({ address: addr, privateKey: body.privateKeys[idx] }));
		return new Response(
			JSON.stringify({ success: true, blockId: blockAssignment.id, creditsAwarded: creditsMillis / 1000, addressMap, flags: { puzzleDetected } }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);

	} catch (error) {
		const err = error as { code?: string };
		if (err?.code === 'P1008' || err?.code === 'P2034') {
			return new Response(
				JSON.stringify({ error: 'Server busy, please retry' }),
				{ status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '5' } }
			);
		}
		console.error('Block submission error:', error);
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export const POST = rateLimitMiddleware(handler);
