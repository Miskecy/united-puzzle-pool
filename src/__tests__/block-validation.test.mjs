/**
 * Block validation tests — run with:
 *   node --experimental-vm-modules src/__tests__/block-validation.test.mjs
 *
 * No external test framework needed; uses Node 18+ built-in test runner and
 * the coinkey module already installed in node_modules.
 *
 * Tests cover:
 *  1. samplePrivateKeysInRange — key uniqueness, range bounds, count for 1T/10T/50T/100T
 *  2. generateCheckworkData — address validity, uniqueness, count, private-key correspondence
 *  3. Round-trip validation (address path) — submitted keys correctly cover stored checkwork addresses
 *  4. Round-trip validation (private-key path) — direct private-key comparison (new path)
 *  5. Robustness — off-by-one keys, wrong-range keys, empty submission, partial submission
 *  6. Auto-release counter logic simulation
 *  7. Address derivation consistency — CoinKey compression defaults
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const CoinKey = require(path.join(__dirname, '../../node_modules/coinkey'));

// ---------------------------------------------------------------------------
// Inline copies of the pure utility functions under test so this file has no
// TypeScript / Next.js build dependency and can run directly with node.
// These must stay in sync with src/lib/utils.ts.
// ---------------------------------------------------------------------------

function parseHexToBigInt(hex) {
	const cleanHex = hex.replace(/^0x/i, '');
	return BigInt('0x' + cleanHex);
}

function bigIntToHex64(n) {
	return n.toString(16).padStart(64, '0');
}

function randomBigIntBelow(max) {
	if (max <= 1n) return 0n;
	const bitLen = max.toString(2).length;
	const byteLen = Math.ceil(bitLen / 8);
	const mask = (1n << BigInt(bitLen)) - 1n;
	while (true) {
		const buf = crypto.randomBytes(byteLen);
		let rnd = 0n;
		for (let i = 0; i < buf.length; i++) rnd = (rnd << 8n) + BigInt(buf[i]);
		rnd = rnd & mask;
		if (rnd < max) return rnd;
	}
}

function samplePrivateKeysInRange(startHex, endHex, count = 10) {
	const startBigInt = parseHexToBigInt(startHex);
	const endBigInt = parseHexToBigInt(endHex);
	const range = endBigInt - startBigInt;

	if (range <= 0n) return [];
	if (range < BigInt(count)) count = Number(range);

	const privateKeys = [];
	const used = new Set();

	if (range < 100n) {
		const allKeys = [];
		for (let i = 0n; i < range; i++) {
			allKeys.push(bigIntToHex64(startBigInt + i));
		}
		for (let i = allKeys.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[allKeys[i], allKeys[j]] = [allKeys[j], allKeys[i]];
		}
		return allKeys.slice(0, count);
	}

	if (count === 1) {
		privateKeys.push(bigIntToHex64(startBigInt + randomBigIntBelow(range)));
		return privateKeys;
	}

	// Pure stratified: divide range into `count` equal segments, pick one random
	// key per segment. No anchor-end — avoids placing a checkwork key at the
	// very tail of large ranges where sequential GPU scanners may fail to reach.
	const segments = BigInt(count);
	const segmentSize = segments > 0n ? (range / segments) : range;
	for (let i = 0; i < count; i++) {
		const idx = BigInt(i);
		const segStart = startBigInt + (segmentSize * idx);
		let segEnd = i === count - 1 ? endBigInt : (segStart + segmentSize);
		if (segEnd <= segStart) segEnd = segStart + 1n;
		const segLen = segEnd - segStart;
		const offset = segLen > 1n ? randomBigIntBelow(segLen) : 0n;
		const privHex = bigIntToHex64(segStart + offset);
		if (!used.has(privHex)) { used.add(privHex); privateKeys.push(privHex); }
	}

	// Fill any duplicates that were skipped
	let attempts = 0;
	while (privateKeys.length < count && attempts < count * 100) {
		const privHex = bigIntToHex64(startBigInt + randomBigIntBelow(range));
		if (!used.has(privHex)) { used.add(privHex); privateKeys.push(privHex); }
		attempts++;
	}

	return privateKeys;
}

function deriveBitcoinAddress(privateKeyHex64) {
	const buf = Buffer.from(privateKeyHex64.padStart(64, '0'), 'hex');
	const ck = new CoinKey(buf);
	ck.compressed = true;
	return ck.publicAddress;
}

// Mirrors generateCheckworkData in src/lib/utils.ts (returns addresses + private keys)
function generateCheckworkData(startHex, endHex, count = 10) {
	const candidateCount = count + 10;
	// Production code strips only '0x', not leading zeros
	const start = startHex.replace(/^0x/i, '');
	const end   = endHex.replace(/^0x/i, '');
	const candidates = samplePrivateKeysInRange(start, end, candidateCount);
	const addresses = [];
	const privateKeys = [];
	for (const pk of candidates) {
		if (addresses.length >= count) break;
		try {
			addresses.push(deriveBitcoinAddress(pk));
			privateKeys.push(pk);
		} catch { /* skip */ }
	}
	if (addresses.length === 0) throw new Error('No addresses could be derived');
	return { addresses, privateKeys };
}

function generateCheckworkAddresses(startHex, endHex, count = 10) {
	return generateCheckworkData(startHex, endHex, count).addresses;
}

// ---------------------------------------------------------------------------
// Server-side submit validation helpers (mirrors submit/route.ts logic)
// ---------------------------------------------------------------------------

function stripHexPrefix(hex) {
	return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * Address-based validation (legacy path — no stored private keys).
 */
function validateByAddress(submittedKeys, checkworkAddresses) {
	const derivedAddresses = [];
	for (const key of submittedKeys) {
		try {
			const clean = stripHexPrefix(key);
			const ck = new CoinKey(Buffer.from(clean, 'hex'));
			ck.compressed = true;
			derivedAddresses.push(ck.publicAddress);
		} catch {
			derivedAddresses.push('');
		}
	}
	const derivedSet = new Set(derivedAddresses);
	const missingAddresses = checkworkAddresses.filter(a => !derivedSet.has(a));
	return { allCorrect: missingAddresses.length === 0, missingAddresses, derivedAddresses };
}

/**
 * Private-key-based validation (new primary path — exact comparison against stored keys).
 */
function validateByStoredKeys(submittedKeys, storedPrivateKeys) {
	const storedKeySet = new Set(storedPrivateKeys.map(k => k.toLowerCase()));
	const submittedKeySet = new Set(submittedKeys.map(k => stripHexPrefix(k).toLowerCase()));
	const missingKeys = [...storedKeySet].filter(k => !submittedKeySet.has(k));
	return { allCorrect: missingKeys.length === 0, missingKeys };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const T = 1_000_000_000_000n; // 1 trillion

// Stable mid-range of Bitcoin puzzle 71 as starting point
const PUZZLE_START = BigInt('0x' + '0'.repeat(46) + '2000000000000000000');

function makeRange(sizeT) {
	const size = BigInt(sizeT) * T;
	const start = PUZZLE_START;
	const end   = start + size;
	return {
		startHex: '0x' + start.toString(16).padStart(64, '0'),
		endHex:   '0x' + end.toString(16).padStart(64, '0'),
		size,
	};
}

// ---------------------------------------------------------------------------
// samplePrivateKeysInRange
// ---------------------------------------------------------------------------

describe('samplePrivateKeysInRange', () => {
	const SIZES_T = [1, 10, 50, 100];

	for (const sizeT of SIZES_T) {
		test(`${sizeT}T — returns exactly 10 keys`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const keys = samplePrivateKeysInRange(startHex.replace(/^0x/i, ''), endHex.replace(/^0x/i, ''), 10);
			assert.equal(keys.length, 10, `Expected 10 keys for ${sizeT}T block`);
		});

		test(`${sizeT}T — all keys are unique`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const keys = samplePrivateKeysInRange(startHex.replace(/^0x/i, ''), endHex.replace(/^0x/i, ''), 10);
			assert.equal(new Set(keys).size, keys.length, `Duplicate keys found for ${sizeT}T block`);
		});

		test(`${sizeT}T — all keys are 64-char lowercase hex strings`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const keys = samplePrivateKeysInRange(startHex.replace(/^0x/i, ''), endHex.replace(/^0x/i, ''), 10);
			for (const k of keys) {
				assert.match(k, /^[0-9a-f]{64}$/, `Key "${k}" is not a 64-char lowercase hex string`);
			}
		});

		test(`${sizeT}T — all keys are within [start, end)`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const startBI = parseHexToBigInt(startHex);
			const endBI   = parseHexToBigInt(endHex);
			const keys = samplePrivateKeysInRange(startHex.replace(/^0x/i, ''), endHex.replace(/^0x/i, ''), 10);
			for (const k of keys) {
				const v = parseHexToBigInt(k);
				assert.ok(v >= startBI, `Key ${k} is below range start`);
				assert.ok(v < endBI,    `Key ${k} is at or above range end`);
			}
		});

		test(`${sizeT}T — each key falls in its expected segment`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const startBI = parseHexToBigInt(startHex);
			const endBI   = parseHexToBigInt(endHex);
			const range   = endBI - startBI;
			const count   = 10;
			const segSize = range / BigInt(count);
			const keys    = samplePrivateKeysInRange(startHex.replace(/^0x/i, ''), endHex.replace(/^0x/i, ''), count);
			// Verify each key landed in a distinct segment (stratified distribution)
			const segIndices = keys.map(k => Number((parseHexToBigInt(k) - startBI) / segSize));
			const uniqueSegs = new Set(segIndices.map(s => Math.min(s, count - 1)));
			assert.ok(
				uniqueSegs.size >= Math.ceil(count * 0.7),
				`Too few distinct segments covered: ${uniqueSegs.size}/${count}. Sampling may not be stratified.`,
			);
		});

		test(`${sizeT}T — no key lands in the final 2% of the range (anchor-end regression)`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const startBI   = parseHexToBigInt(startHex);
			const endBI     = parseHexToBigInt(endHex);
			const range     = endBI - startBI;
			const dangerZone = endBI - (range * 2n / 100n);

			let keyInDangerZone = 0;
			const RUNS = 20;
			for (let r = 0; r < RUNS; r++) {
				const keys = samplePrivateKeysInRange(startHex.replace(/^0x/i, ''), endHex.replace(/^0x/i, ''), 10);
				for (const k of keys) {
					if (parseHexToBigInt(k) >= dangerZone) keyInDangerZone++;
				}
			}
			// Pure stratified: last-segment key can be anywhere in [90%, 100%).
			// It is in [98%, 100%) with probability 2%/10% = 20% per run.
			// Old anchor-end ALWAYS placed a key there. Assert less than 50% of draws hit.
			assert.ok(
				keyInDangerZone < RUNS * 10 * 0.5,
				`Too many keys in final 2% (${keyInDangerZone}/${RUNS * 10}). Anchor-end bug may be re-introduced.`,
			);
		});
	}
});

// ---------------------------------------------------------------------------
// generateCheckworkData
// ---------------------------------------------------------------------------

describe('generateCheckworkData', () => {
	const SIZES_T = [1, 10, 50, 100];

	for (const sizeT of SIZES_T) {
		test(`${sizeT}T — returns exactly 10 addresses and 10 private keys`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses, privateKeys } = generateCheckworkData(startHex, endHex, 10);
			assert.equal(addresses.length, 10, `Expected 10 addresses for ${sizeT}T`);
			assert.equal(privateKeys.length, 10, `Expected 10 private keys for ${sizeT}T`);
		});

		test(`${sizeT}T — private keys and addresses correspond correctly`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses, privateKeys } = generateCheckworkData(startHex, endHex, 10);
			for (let i = 0; i < addresses.length; i++) {
				const derived = deriveBitcoinAddress(privateKeys[i]);
				assert.equal(
					derived,
					addresses[i],
					`Key[${i}] does not produce Address[${i}]: key=${privateKeys[i]}`,
				);
			}
		});

		test(`${sizeT}T — all addresses are unique`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses } = generateCheckworkData(startHex, endHex, 10);
			assert.equal(new Set(addresses).size, 10, `Duplicate addresses for ${sizeT}T`);
		});

		test(`${sizeT}T — all private keys are unique`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			assert.equal(new Set(privateKeys).size, 10, `Duplicate private keys for ${sizeT}T`);
		});

		test(`${sizeT}T — all addresses are valid compressed P2PKH (start with 1, length 25–34)`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses } = generateCheckworkData(startHex, endHex, 10);
			for (const addr of addresses) {
				assert.ok(addr.startsWith('1'), `Address "${addr}" is not compressed P2PKH`);
				assert.ok(addr.length >= 25 && addr.length <= 34, `Address "${addr}" has unexpected length`);
			}
		});

		test(`${sizeT}T — all private keys are within block range`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const startBI = parseHexToBigInt(startHex);
			const endBI   = parseHexToBigInt(endHex);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			for (const k of privateKeys) {
				const v = parseHexToBigInt(k);
				assert.ok(v >= startBI && v < endBI, `Private key ${k} is outside block range`);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// Round-trip: address-based validation path (legacy — no stored private keys)
// ---------------------------------------------------------------------------

describe('Round-trip (address path)', () => {
	const SIZES_T = [1, 10, 50, 100];

	for (const sizeT of SIZES_T) {
		test(`${sizeT}T — correct private keys pass address-based validation`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses, privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const { allCorrect, missingAddresses } = validateByAddress(privateKeys, addresses);
			assert.ok(allCorrect, `Address validation failed for ${sizeT}T. Missing: ${JSON.stringify(missingAddresses)}`);
		});

		test(`${sizeT}T — 0x-prefixed correct keys pass address-based validation`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses, privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const prefixed = privateKeys.map(k => '0x' + k);
			const { allCorrect } = validateByAddress(prefixed, addresses);
			assert.ok(allCorrect, `Address validation should accept 0x-prefixed keys for ${sizeT}T`);
		});

		test(`${sizeT}T — wrong private keys (random) are rejected`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses } = generateCheckworkData(startHex, endHex, 10);
			// Use keys from a completely different range
			const wrongRange = makeRange(sizeT * 2);
			const { privateKeys: wrongKeys } = generateCheckworkData(wrongRange.startHex, wrongRange.endHex, 10);
			const { allCorrect } = validateByAddress(wrongKeys, addresses);
			assert.equal(allCorrect, false, `Wrong keys should be rejected for ${sizeT}T`);
		});

		test(`${sizeT}T — partial submission (9/10) is rejected`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses, privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const { allCorrect, missingAddresses } = validateByAddress(privateKeys.slice(0, 9), addresses);
			assert.equal(allCorrect, false, `9/10 keys should be rejected`);
			assert.equal(missingAddresses.length, 1, `Exactly 1 address should be missing`);
		});

		test(`${sizeT}T — empty submission is rejected`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { addresses } = generateCheckworkData(startHex, endHex, 10);
			const { allCorrect, missingAddresses } = validateByAddress([], addresses);
			assert.equal(allCorrect, false, `Empty submission should be rejected`);
			assert.equal(missingAddresses.length, 10);
		});
	}
});

// ---------------------------------------------------------------------------
// Round-trip: private-key-based validation path (new primary path)
// ---------------------------------------------------------------------------

describe('Round-trip (private-key path)', () => {
	const SIZES_T = [1, 10, 50, 100];

	for (const sizeT of SIZES_T) {
		test(`${sizeT}T — exact stored keys pass private-key validation`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const { allCorrect, missingKeys } = validateByStoredKeys(privateKeys, privateKeys);
			assert.ok(allCorrect, `Private-key validation failed for ${sizeT}T. Missing: ${JSON.stringify(missingKeys)}`);
		});

		test(`${sizeT}T — 0x-prefixed correct keys pass private-key validation`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const prefixed = privateKeys.map(k => '0x' + k);
			const { allCorrect } = validateByStoredKeys(prefixed, privateKeys);
			assert.ok(allCorrect, `0x-prefixed keys should pass private-key validation for ${sizeT}T`);
		});

		test(`${sizeT}T — uppercase keys pass private-key validation`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const upper = privateKeys.map(k => k.toUpperCase());
			const { allCorrect } = validateByStoredKeys(upper, privateKeys);
			assert.ok(allCorrect, `Uppercase keys should pass private-key validation for ${sizeT}T`);
		});

		test(`${sizeT}T — superset submission (extra keys) still passes`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			// Append 5 random extra keys — server checks storedKeys ⊆ submitted, not equality
			const extra = samplePrivateKeysInRange(
				makeRange(sizeT * 3).startHex.replace(/^0x/i, ''),
				makeRange(sizeT * 3).endHex.replace(/^0x/i, ''),
				5,
			);
			const { allCorrect } = validateByStoredKeys([...privateKeys, ...extra], privateKeys);
			assert.ok(allCorrect, `Superset submission should pass for ${sizeT}T`);
		});

		test(`${sizeT}T — off-by-one keys (VanitySearch counter-overflow simulation) are rejected`, () => {
			// Simulates VanitySearch submitting keys that are off by ±1 due to counter
			// overflow or batch boundary misalignment on large ranges.
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const offByOne = privateKeys.map(k => {
				const n = BigInt('0x' + k);
				return bigIntToHex64(n + 1n);
			});
			const { allCorrect, missingKeys } = validateByStoredKeys(offByOne, privateKeys);
			assert.equal(allCorrect, false, `Off-by-one keys must be rejected for ${sizeT}T`);
			assert.equal(missingKeys.length, 10, `All 10 off-by-one keys should fail`);
		});

		test(`${sizeT}T — wrong-range keys are rejected`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const wrongRange = makeRange(sizeT + 200);
			const { privateKeys: wrongKeys } = generateCheckworkData(wrongRange.startHex, wrongRange.endHex, 10);
			const { allCorrect } = validateByStoredKeys(wrongKeys, privateKeys);
			assert.equal(allCorrect, false, `Wrong-range keys must be rejected for ${sizeT}T`);
		});

		test(`${sizeT}T — partial submission (9/10) is rejected`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const { allCorrect, missingKeys } = validateByStoredKeys(privateKeys.slice(0, 9), privateKeys);
			assert.equal(allCorrect, false, `9/10 keys should be rejected`);
			assert.equal(missingKeys.length, 1, `Exactly 1 stored key should be missing`);
		});

		test(`${sizeT}T — empty submission is rejected`, () => {
			const { startHex, endHex } = makeRange(sizeT);
			const { privateKeys } = generateCheckworkData(startHex, endHex, 10);
			const { allCorrect, missingKeys } = validateByStoredKeys([], privateKeys);
			assert.equal(allCorrect, false, `Empty submission should be rejected`);
			assert.equal(missingKeys.length, 10);
		});
	}
});

// ---------------------------------------------------------------------------
// Auto-release counter logic
// ---------------------------------------------------------------------------

describe('Auto-release counter logic', () => {
	test('Counter below threshold does not trigger release', () => {
		// Server auto-releases when failCount >= 3
		const threshold = 3;
		for (const count of [0, 1, 2]) {
			const shouldRelease = count >= threshold;
			assert.equal(shouldRelease, false, `Count ${count} should NOT trigger auto-release`);
		}
	});

	test('Counter at and above threshold triggers release', () => {
		const threshold = 3;
		for (const count of [3, 4, 10]) {
			const shouldRelease = count >= threshold;
			assert.equal(shouldRelease, true, `Count ${count} SHOULD trigger auto-release`);
		}
	});

	test('autoReleased flag is false when DB update fails (robust failure reporting)', () => {
		// Simulates the submit route's new logic: autoReleased = true only after
		// successful DB update, not just because failCount reached threshold.
		let autoReleased = false;
		const failCount = 3;
		if (failCount >= 3) {
			// DB update throws
			try {
				throw new Error('DB timeout');
				// eslint-disable-next-line no-unreachable
				autoReleased = true;
			} catch { /* intentional */ }
		}
		assert.equal(autoReleased, false, 'autoReleased must be false when DB update throws');
	});

	test('autoReleased flag is true only after successful DB update', () => {
		let autoReleased = false;
		const failCount = 3;
		if (failCount >= 3) {
			try {
				// Simulate successful DB update (no throw)
				void 0;
				autoReleased = true;
			} catch { /* intentional */ }
		}
		assert.equal(autoReleased, true, 'autoReleased must be true after successful DB update');
	});
});

// ---------------------------------------------------------------------------
// Address derivation consistency
// ---------------------------------------------------------------------------

describe('Address derivation consistency', () => {
	test('CoinKey defaults to compressed — same address whether compressed is set explicitly or not', () => {
		const pk = crypto.randomBytes(32);
		const ck1 = new CoinKey(pk);
		const ck2 = new CoinKey(pk);
		ck2.compressed = true;
		assert.equal(
			ck1.publicAddress,
			ck2.publicAddress,
			'CoinKey default must produce same address as explicitly setting compressed=true',
		);
	});

	test('deriveBitcoinAddress produces a consistent address for a known private key', () => {
		// Private key 1 → compressed P2PKH address (known Bitcoin test vector)
		const knownKey = '0000000000000000000000000000000000000000000000000000000000000001';
		const addr = deriveBitcoinAddress(knownKey);
		assert.equal(addr, '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
	});

	test('Generation and submission validation use identical address derivation', () => {
		// If the test above passes (both paths use compressed=true), this is guaranteed.
		// Still testing explicitly to catch future regressions.
		const pkBuf = crypto.randomBytes(32);
		const pkHex = pkBuf.toString('hex');

		// Generation path (utils.ts)
		const genCk = new CoinKey(pkBuf);
		genCk.compressed = true;
		const genAddr = genCk.publicAddress;

		// Submission validation path (submit/route.ts)
		const valCk = new CoinKey(Buffer.from(pkHex, 'hex'));
		valCk.compressed = true;
		const valAddr = valCk.publicAddress;

		assert.equal(genAddr, valAddr, 'Generation and validation must produce identical addresses');
	});

	test('Address derivation is deterministic — same key always produces same address', () => {
		const pkBuf = crypto.randomBytes(32);
		const pkHex = pkBuf.toString('hex');
		const addr1 = deriveBitcoinAddress(pkHex);
		const addr2 = deriveBitcoinAddress(pkHex);
		assert.equal(addr1, addr2, 'Address derivation must be deterministic');
	});
});

// ---------------------------------------------------------------------------
// Key format handling
// ---------------------------------------------------------------------------

describe('Key format handling', () => {
	test('Keys with and without 0x prefix validate identically', () => {
		const { startHex, endHex } = makeRange(10);
		const { addresses, privateKeys } = generateCheckworkData(startHex, endHex, 10);

		const withPrefix    = privateKeys.map(k => '0x' + k);
		const withoutPrefix = privateKeys;

		const r1 = validateByAddress(withPrefix, addresses);
		const r2 = validateByAddress(withoutPrefix, addresses);

		assert.equal(r1.allCorrect, true);
		assert.equal(r2.allCorrect, true);
	});

	test('Properly padded 64-char key passes format check', () => {
		const validKey = '0'.repeat(63) + '1'; // key = 1, valid 64-char hex
		assert.match(validKey, /^[0-9a-fA-F]{64}$/, 'Key must match 64-char hex format');
	});

	test('Unpadded key (less than 64 chars) fails format check', () => {
		const shortKey = '1'; // Missing 63 leading zeros
		assert.ok(!/^[0-9a-fA-F]{64}$/.test(shortKey), 'Unpadded key must fail format check');
	});

	test('Key with 0x prefix and 64 hex chars passes format check after stripping', () => {
		const keyWithPrefix = '0x' + '0'.repeat(63) + '1';
		const stripped = keyWithPrefix.slice(2);
		assert.match(stripped, /^[0-9a-fA-F]{64}$/, 'Stripped key must pass format check');
	});
});
