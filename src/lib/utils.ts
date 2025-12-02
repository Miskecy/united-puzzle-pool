import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import CoinKey from 'coinkey';
import crypto from 'crypto';

export function parseHexToBigInt(hex: string): bigint {
	// Remove 0x prefix if present
	const cleanHex = hex.replace(/^0x/i, '');
	return BigInt('0x' + cleanHex);
}

export function bigIntToHex64(n: bigint): string {
	return n.toString(16).padStart(64, '0');
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function generateRandomToken(length: number = 64): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

export function randomBigIntBelow(max: bigint): bigint {
	if (max <= 1n) return 0n;
	const bitLen = max.toString(2).length;
	const byteLen = Math.ceil(bitLen / 8);
	const mask = (1n << BigInt(bitLen)) - 1n;
	while (true) {
		const buf = crypto.randomBytes(byteLen);
		let rnd = 0n;
		for (let i = 0; i < buf.length; i++) {
			rnd = (rnd << 8n) + BigInt(buf[i]);
		}
		rnd = rnd & mask;
		if (rnd < max) return rnd;
	}
}

export function randomIndexByWeights(weights: bigint[]): number {
	if (!weights.length) return 0;
	let total = 0n;
	for (let i = 0; i < weights.length; i++) total += (weights[i] > 0n ? weights[i] : 0n);
	if (total <= 0n) return 0;
	const r = randomBigIntBelow(total);
	let acc = 0n;
	for (let i = 0; i < weights.length; i++) {
		const w = weights[i] > 0n ? weights[i] : 0n;
		acc += w;
		if (r < acc) return i;
	}
	return weights.length - 1;
}

export function generateBitcoinAddress(): string {
	const wallet = new CoinKey(crypto.randomBytes(32));
	return wallet.publicAddress;
}

export function generateBitcoinAddressFromPrivateKey(privateKey: string): string {
	try {
		const wallet = new CoinKey(Buffer.from(privateKey, 'hex'));
		return wallet.publicAddress;
	} catch {
		throw new Error('Invalid private key format');
	}
}

export function generateHexRange(size?: bigint): { start: string; end: string } {
	// Use BLOCK_RANGE_SIZE_KEYS from environment if size not provided
	const blockSize = size || (process.env.BLOCK_RANGE_SIZE_KEYS ? BigInt(process.env.BLOCK_RANGE_SIZE_KEYS) : BigInt('1000000000000'));

	// Use environment variables for puzzle range if available
	const puzzleStart = process.env.PUZZLE_START_RANGE ? BigInt('0x' + process.env.PUZZLE_START_RANGE) : 0n;
	const puzzleEnd = process.env.PUZZLE_END_RANGE ? BigInt('0x' + process.env.PUZZLE_END_RANGE) : (1n << 71n);

	// Generate a random hex range within puzzle bounds
	const maxRange = puzzleEnd - puzzleStart;
	const sizeBigInt = blockSize > maxRange ? maxRange : blockSize;
	const randomOffset = randomBigIntBelow(maxRange - sizeBigInt);
	const start = puzzleStart + randomOffset;
	const end = start + sizeBigInt;

	return {
		start: '0x' + start.toString(16).padStart(64, '0'),
		end: '0x' + end.toString(16).padStart(64, '0')
	};
}

export function generateRandomBitcoinAddresses(count: number = 10): string[] {
	const addresses: string[] = [];
	const puzzleAddress = process.env.BITCOIN_PUZZLE_ADDRESS || '1BitcoinEaterAddressDontSendf59kuE';

	// Add the puzzle address as the first address
	addresses.push(puzzleAddress);

	// Generate remaining addresses randomly
	for (let i = 1; i < count; i++) {
		addresses.push(generateBitcoinAddress());
	}
	return addresses;
}

export function isValidPrivateKey(privateKey: string): boolean {
	try {
		// Check if it's a valid hex string of 64 characters
		if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
			return false;
		}

		// Check if it's within the valid range for secp256k1
		const privateKeyBigInt = BigInt('0x' + privateKey);
		const maxValid = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140');

		return privateKeyBigInt > 0 && privateKeyBigInt <= maxValid;
	} catch {
		return false;
	}
}

export function formatAddress(address: string): string {
	if (address.length <= 12) return address;
	return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function formatBitcoinAddress(address: string): string {
	return formatAddress(address);
}

export function formatNumber(num: number): string {
	return new Intl.NumberFormat().format(num);
}

export function formatTimeRemaining(expiresAt: Date): string {
	const now = new Date();
	const expires = new Date(expiresAt);
	const diff = expires.getTime() - now.getTime();

	if (diff <= 0) return 'Expired';

	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
	const seconds = Math.floor((diff % (1000 * 60)) / 1000);

	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	} else {
		return `${seconds}s`;
	}
}

export function calculateExpirationTime(hours: number = 12): Date {
	const expiration = new Date();
	expiration.setHours(expiration.getHours() + hours);
	return expiration;
}

export function samplePrivateKeysInRange(startHex: string, endHex: string, count: number = 10): string[] {
	console.log('samplePrivateKeysInRange - Parâmetros recebidos:');
	console.log('startHex:', startHex);
	console.log('endHex:', endHex);
	console.log('count:', count);

	const startBigInt = parseHexToBigInt(startHex);
	const endBigInt = parseHexToBigInt(endHex);
	console.log('startBigInt (hex):', bigIntToHex64(startBigInt));
	console.log('endBigInt (hex):', bigIntToHex64(endBigInt));

	const range = endBigInt - startBigInt;
	console.log('range calculado:', range.toString());

	if (range <= 0n) {
		console.log('Range inválido (<= 0), retornando array vazio');
		return [];
	}

	// Se o range for menor que o count, ajustar o count
	if (range < BigInt(count)) {
		console.log(`Range (${range}) menor que count (${count}), ajustando count para ${Number(range)}`);
		count = Number(range);
	}

	const privateKeys: string[] = [];
	const used = new Set<string>();

	// Se o range for muito pequeno, gerar todas as chaves possíveis e embaralhar
	if (range < 100n) {
		console.log('Range pequeno detectado (< 100), gerando todas as chaves possíveis');
		const allKeys: string[] = [];
		for (let i = 0n; i < range; i++) {
			const priv = startBigInt + i;
			const hex64 = bigIntToHex64(priv);
			allKeys.push(hex64);
		}

		// Embaralhar o array
		for (let i = allKeys.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[allKeys[i], allKeys[j]] = [allKeys[j], allKeys[i]];
		}

		return allKeys.slice(0, count);
	}

	console.log('Gerando chaves privadas aleatórias com crypto.randomBytes...');
	let attempts = 0;
	const maxAttempts = count * 100; // Limite de tentativas para evitar loops infinitos

	while (privateKeys.length < count && attempts < maxAttempts) {
		// Gerar bytes aleatórios e converter para BigInt
		const randomBytes = crypto.randomBytes(32);
		const randomHex = randomBytes.toString('hex');
		const randomBigInt = BigInt('0x' + randomHex);

		// Calcular offset usando módulo
		const randomOffset = randomBigInt % range;
		const privateKeyBigInt = startBigInt + randomOffset;
		const privateKeyHex = bigIntToHex64(privateKeyBigInt);

		if (!used.has(privateKeyHex)) {
			used.add(privateKeyHex);
			privateKeys.push(privateKeyHex);
		}
		attempts++;
	}

	console.log(`Chaves privadas geradas: ${privateKeys.length}`);
	return privateKeys;
}

export function deriveBitcoinAddressFromPrivateKeyHex(hex: string): string {
	try {
		// Strip 0x prefix if present
		const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

		// Ensure hex is 64 characters (32 bytes)
		const paddedHex = cleanHex.padStart(64, '0');
		console.log('Convertendo hex para Bitcoin address:', paddedHex);

		// Verificar se o hex é válido
		if (!/^[0-9a-fA-F]{64}$/.test(paddedHex)) {
			throw new Error('Hex inválido: não tem 64 caracteres hexadecimais');
		}

		// Create wallet from private key hex string
		const wallet = new CoinKey(Buffer.from(paddedHex, 'hex'));
		console.log('Bitcoin address gerada:', wallet.publicAddress);

		// Return the P2PKH base58 address
		return wallet.publicAddress;
	} catch (error) {
		console.error('Erro em deriveBitcoinAddressFromPrivateKeyHex:', error);
		// Tentar método alternativo
		try {
			const cleanHex = hex.padStart(64, '0');
			const privateKeyBuffer = Buffer.from(cleanHex, 'hex');

			// Criar instância CoinKey manualmente
			const ck = new CoinKey(privateKeyBuffer);
			console.log('Bitcoin address gerada (método alternativo):', ck.publicAddress);
			return ck.publicAddress;
		} catch (error2) {
			console.error('Erro no método alternativo:', error2);
			// Retornar um valor padrão ao invés de lançar erro
			return '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'; // Endereço de teste padrão
		}
	}
}

export function generateCheckworkAddresses(start: string, end: string, count: number = 10): string[] {
	console.log('generateCheckworkAddresses chamado com:', start, end, count);

	// Generate random private keys within the range
	const privateKeys = samplePrivateKeysInRange(start.replace('0x', ''), end.replace('0x', ''), count);
	console.log('Private keys gerados:', privateKeys.length, privateKeys);

	if (privateKeys.length < count) {
		throw new Error(`Não foi possível gerar ${count} chaves privadas únicas dentro do range`);
	}

	// Convert private keys to Bitcoin addresses
	const addresses: string[] = [];
	for (const privateKeyHex of privateKeys) {
		try {
			const address = deriveBitcoinAddressFromPrivateKeyHex(privateKeyHex);
			console.log('Endereço Bitcoin gerado:', address);
			addresses.push(address);
		} catch (error) {
			console.error('Erro ao gerar Bitcoin address:', error);
			throw new Error(`Falha ao gerar endereço Bitcoin da chave privada: ${error}`);
		}
	}

	if (addresses.length !== count) {
		throw new Error(`Não foi possível gerar ${count} endereços Bitcoin`);
	}

	console.log('Endereços Bitcoin gerados:', addresses.length, addresses);
	return addresses;
}
