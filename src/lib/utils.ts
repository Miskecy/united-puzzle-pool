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
export const SCALED_UNITS: Array<{ label: string; factor: bigint }> = [
	{ label: 'E', factor: 1_000_000_000_000_000_000n },
	{ label: 'P', factor: 1_000_000_000_000_000n },
	{ label: 'T', factor: 1_000_000_000_000n },
	{ label: 'B', factor: 1_000_000_000n },
	{ label: 'M', factor: 1_000_000n },
	{ label: 'K', factor: 1_000n },
	{ label: '', factor: 1n },
]

export function formatScaledKeys(len: bigint): string {
	let idx = SCALED_UNITS.findIndex(u => len >= u.factor)
	if (idx < 0) idx = SCALED_UNITS.length - 1
	while (idx > 0) {
		const u = SCALED_UNITS[idx]
		const scaledInt = len / u.factor
		if (scaledInt >= 1000n) idx -= 1
		else break
	}
	const u = SCALED_UNITS[idx]
	const intPart = len / u.factor
	const rem = len % u.factor
	const twoDec = (rem * 100n) / u.factor
	if (intPart >= 100n) {
		return `${intPart.toString()}${u.label}Keys`
	} else if (intPart >= 10n) {
		const oneDec = twoDec / 10n
		return `${intPart.toString()}.${oneDec.toString().padStart(1, '0')}${u.label}Keys`
	}
	return `${intPart.toString()}.${twoDec.toString().padStart(2, '0')}${u.label}Keys`
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

	console.log('Gerando chaves privadas com ancoras e amostragem estratificada...');

	if (count === 1) {
		const midOffset = randomBigIntBelow(range);
		const midBI = startBigInt + midOffset;
		privateKeys.push(bigIntToHex64(midBI));
		return privateKeys;
	}

	// Purely stratified sampling across the entire range.
	// The previous anchor-end strategy placed one checkwork key in the final 2% of
	// the range, which caused GPU scanners (e.g. VanitySearch) to miss it when they
	// had any batch-boundary or counter-overflow issue near the end of a large range
	// (observed with 10T+ blocks). Pure stratified sampling distributes all checkwork
	// keys evenly so no single key is disproportionately close to the range boundary.
	const segments = BigInt(count);
	const segmentSize = segments > 0n ? (range / segments) : range;
	for (let i = 0; i < count; i++) {
		const idx = BigInt(i);
		const segStart = startBigInt + (segmentSize * idx);
		let segEnd = i === count - 1 ? endBigInt : (segStart + segmentSize);
		if (segEnd <= segStart) segEnd = segStart + 1n;
		const segLen = segEnd - segStart;
		const offset = segLen > 1n ? randomBigIntBelow(segLen) : 0n;
		const privBI = segStart + offset;
		const privHex = bigIntToHex64(privBI);
		if (!used.has(privHex)) {
			used.add(privHex);
			privateKeys.push(privHex);
		}
	}

	let attempts = 0;
	const maxAttempts = count * 100;
	while (privateKeys.length < count && attempts < maxAttempts) {
		const offset = randomBigIntBelow(range);
		const privBI = startBigInt + offset;
		const privHex = bigIntToHex64(privBI);
		if (!used.has(privHex)) { used.add(privHex); privateKeys.push(privHex); }
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
		// Ensure compressed public key mode for compressed P2PKH address
		(wallet as unknown as { compressed?: boolean }).compressed = true;
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
			(ck as unknown as { compressed?: boolean }).compressed = true;
			console.log('Bitcoin address gerada (método alternativo):', ck.publicAddress);
			return ck.publicAddress;
		} catch (error2) {
			console.error('Erro no método alternativo:', error2);
			throw new Error(`Failed to derive Bitcoin address from key: ${error2}`);
		}
	}
}

export function generateCheckworkData(start: string, end: string, count: number = 10): { addresses: string[]; privateKeys: string[] } {
	console.log('generateCheckworkData chamado com:', start, end, count);

	// Sample extra candidates so we can skip any that fail address derivation
	const candidateCount = count + 10;
	const candidates = samplePrivateKeysInRange(start.replace('0x', ''), end.replace('0x', ''), candidateCount);
	console.log('Private keys gerados:', candidates.length);

	const addresses: string[] = [];
	const privateKeys: string[] = [];
	for (const privateKeyHex of candidates) {
		if (addresses.length >= count) break;
		try {
			const address = deriveBitcoinAddressFromPrivateKeyHex(privateKeyHex);
			addresses.push(address);
			privateKeys.push(privateKeyHex);
		} catch (error) {
			console.error('Skipping key that failed address derivation:', privateKeyHex, error);
		}
	}

	if (addresses.length === 0) {
		throw new Error('Failed to derive any Bitcoin addresses for checkwork');
	}

	console.log('Endereços Bitcoin gerados:', addresses.length);
	return { addresses, privateKeys };
}

export function generateCheckworkAddresses(start: string, end: string, count: number = 10): string[] {
	return generateCheckworkData(start, end, count).addresses;
}
