import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveBlockByToken, clearActiveBlock } from '@/lib/redis';
import CoinKey from 'coinkey';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { loadPuzzleConfig } from '@/lib/config';

interface BlockSubmissionRequest {
	privateKeys: string[];
	blockId?: string;
}

// Helper function to strip 0x prefix from hex strings
function stripHexPrefix(hex: string): string {
	return hex.startsWith('0x') ? hex.slice(2) : hex;
}

// Função auxiliar para retry com tratamento de P1008
const withRetries = async <T>(fn: () => Promise<T>): Promise<T> => {
	let attempts = 0;
	const maxAttempts = 3;
	while (true) {
		try {
			return await fn();
		} catch (err) {
			const code = (err as { code?: string }).code;
			if (code === 'P1008' && attempts < maxAttempts - 1) {
				attempts++;
				// Espera com jitter antes de tentar novamente
				await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random() * 400)));
				continue;
			}
			throw err;
		}
	}
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

		if (!body.privateKeys || !Array.isArray(body.privateKeys) || body.privateKeys.length < 10) {
			return new Response(
				JSON.stringify({ error: 'At least 10 private keys must be provided' }),
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
				const fromRedis = await getActiveBlockByToken(token);
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

		if (!blockAssignment || blockAssignment.userTokenId !== userToken.id || blockAssignment.status !== 'ACTIVE') {
			const error = !blockAssignment
				? 'Block not found'
				: blockAssignment.userTokenId !== userToken.id
					? 'Block does not belong to this token'
					: 'Block already completed or expired';
			return new Response(
				JSON.stringify({ error }),
				{ status: blockAssignment ? 400 : 404, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// 6. Validação das Chaves Privadas
		const checkworkAddresses = JSON.parse(blockAssignment.checkworkAddresses) as string[];
		const derivedAddresses: string[] = [];
		const results: { privateKey: string; address: string; isValid: boolean }[] = [];

		for (let i = 0; i < body.privateKeys.length; i++) {
			try {
				const cleanPrivateKey = stripHexPrefix(body.privateKeys[i]);
				// CoinKey é uma biblioteca para endereços de Bitcoin. Se for Ethereum, ajuste para a biblioteca correta (e.g., ethers/web3/keccak256)
				const address = new CoinKey(Buffer.from(cleanPrivateKey, 'hex')).publicAddress;
				derivedAddresses.push(address);
				results.push({
					privateKey: body.privateKeys[i],
					address,
					isValid: new Set(checkworkAddresses).has(address),
				});
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
		const allCorrect = missingAddresses.length === 0;

		const cfg = await loadPuzzleConfig();
		const puzzleAddress = cfg?.address || userToken.bitcoinAddress;
		const puzzleDetected = !!puzzleAddress && derivedAddressesSet.has(puzzleAddress);

		if (!allCorrect) {
			return new Response(
				JSON.stringify({
					error: 'Not all private keys are correct',
					details: {
						expected: checkworkAddresses,
						derived: derivedAddresses,
						missing: missingAddresses,
					},
					results,
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
		const credits = creditsMillis / 1000;

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
					update: { privateKeys: JSON.stringify(body.privateKeys), creditsAwarded: credits },
					create: {
						blockAssignmentId: blockAssignment.id,
						privateKeys: JSON.stringify(body.privateKeys),
						creditsAwarded: credits,
					},
				}),
                ...(puzzleDetected ? [
                    prisma.$executeRawUnsafe(
                        `UPDATE block_solutions SET puzzle_private_key = ? WHERE block_assignment_id = ?`,
                        (() => {
                            const idx = derivedAddresses.findIndex(a => a === (cfg?.address || userToken.bitcoinAddress));
                            return idx >= 0 ? body.privateKeys[idx] : null;
                        })(),
                        blockAssignment.id
                    ),
                    prisma.puzzleConfig.updateMany({
                        where: { active: true },
                        data: {
                            solved: true,
                            puzzlePrivateKey: (() => {
                                const idx = derivedAddresses.findIndex(a => a === (cfg?.address || userToken.bitcoinAddress));
                                return idx >= 0 ? body.privateKeys[idx] : null;
                            })()
                        }
                    })
                ] : []),
				// Cria a transação de crédito
				prisma.creditTransaction.create({
					data: {
						userTokenId: userToken.id,
						type: 'EARNED',
						amount: credits,
						description: `Block ${blockAssignment.id} completed`,
					},
				}),
			])
		);

		// 9. Limpar o bloco ativo do Redis
		try {
			const currentActive = await getActiveBlockByToken(token);
			if (currentActive === blockAssignment.id) {
				await clearActiveBlock(token);
			}
		} catch { }

		// 10. Resposta de Sucesso
		const addressMap = derivedAddresses.map((addr, idx) => ({ address: addr, privateKey: body.privateKeys[idx] }));
		return new Response(
			JSON.stringify({ success: true, blockId: blockAssignment.id, creditsAwarded: credits, addressMap, flags: { puzzleDetected } }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);

	} catch (error) {
		// Tratamento de erro geral (inclui o timeout do DB P1008)
		const err = error as { code?: string };
		if (err?.code === 'P1008') {
			return new Response(
				JSON.stringify({ error: 'Database timeout' }),
				{ status: 504, headers: { 'Content-Type': 'application/json' } }
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
