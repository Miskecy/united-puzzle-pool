// Web Worker for Browser Mining
// Uses elliptic and crypto-js from CDN for reliability
importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/elliptic/6.5.4/elliptic.min.js'
);
importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js'
);

// Initialize Elliptic Curve (secp256k1)
const EC = elliptic.ec;
const ec = new EC('secp256k1');

// Base58 Alphabet
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = BigInt(58);

// Helper: Convert Hex to Base58 (with leading zeros handling)
function toBase58(hex) {
    let n = BigInt('0x' + hex);
    let result = '';
    while (n > 0n) {
        const remainder = n % BASE;
        n = n / BASE;
        result = ALPHABET[Number(remainder)] + result;
    }
    // Handle leading zeros (each '00' byte becomes a '1')
    for (let i = 0; i < hex.length; i += 2) {
        if (hex.substr(i, 2) === '00') {
            result = '1' + result;
        } else {
            break;
        }
    }
    return result;
}

// Helper: Generate Bitcoin Address from Private Key Hex
function generateAddress(privateKeyHex) {
    // 1. Get Public Key (Compressed)
    const key = ec.keyFromPrivate(privateKeyHex);
    const pubKeyHex = key.getPublic(true, 'hex');

    // 2. SHA256(PublicKey)
    const sha256 = CryptoJS.SHA256(CryptoJS.enc.Hex.parse(pubKeyHex));

    // 3. RIPEMD160(SHA256)
    const ripemd160 = CryptoJS.RIPEMD160(sha256);

    // 4. Add Version Byte (0x00 for Mainnet)
    const versionByte = '00';
    const payloadHex = versionByte + ripemd160.toString(CryptoJS.enc.Hex);

    // 5. Checksum: SHA256(SHA256(Payload))
    const checksumHash = CryptoJS.SHA256(
        CryptoJS.SHA256(CryptoJS.enc.Hex.parse(payloadHex))
    );
    const checksumHex = checksumHash.toString(CryptoJS.enc.Hex).substring(0, 8);

    // 6. Base58 Encode (Payload + Checksum)
    return toBase58(payloadHex + checksumHex);
}

// Helper: BigInt to 64-char Hex
function bigIntToHex64(n) {
    return n.toString(16).padStart(64, '0');
}

let isMining = false;

self.onmessage = function (e) {
    const { type, data } = e.data;

    if (type === 'START') {
        isMining = true;
        mineLoop(data.start, data.end, data.targets, data.puzzleAddress);
    } else if (type === 'STOP') {
        isMining = false;
    }
};

function mineLoop(startHex, endHex, targets, puzzleAddress) {
    // Ensure 0x prefix for BigInt conversion
    const startStr = startHex.startsWith('0x') ? startHex : '0x' + startHex;
    const endStr = endHex.startsWith('0x') ? endHex : '0x' + endHex;

    let current = BigInt(startStr);
    const end = BigInt(endStr);

    let keysScannedSinceLastReport = 0;
    let lastReport = Date.now();

    function runBatch() {
        if (!isMining) return;

        if (current > end) {
            self.postMessage({ type: 'FINISHED' });
            isMining = false;
            return;
        }

        const batchStart = Date.now();
        let scannedInBatch = 0;

        // Process batch (Time-based: 500ms)
        while (Date.now() - batchStart < 500) {
            if (current > end) break;

            const privateKeyHex = bigIntToHex64(current);

            try {
                const address = generateAddress(privateKeyHex);

                // Check Puzzle
                if (puzzleAddress && address === puzzleAddress) {
                    self.postMessage({
                        type: 'FOUND',
                        key: privateKeyHex,
                        isPuzzle: true,
                    });
                    isMining = false;
                    return;
                }

                // Check Targets
                if (targets && targets.includes(address)) {
                    self.postMessage({
                        type: 'FOUND',
                        key: privateKeyHex,
                        isPuzzle: false,
                    });
                }
            } catch (e) {
                console.error('Mining error:', e);
            }

            current += 1n;
            scannedInBatch++;
        }

        keysScannedSinceLastReport += scannedInBatch;

        // Report progress
        const elapsed = (Date.now() - lastReport) / 1000;
        if (elapsed > 1) {
            self.postMessage({
                type: 'PROGRESS',
                data: {
                    current: bigIntToHex64(current),
                    keysScanned: keysScannedSinceLastReport,
                    speed: 0,
                },
            });
            keysScannedSinceLastReport = 0;
            lastReport = Date.now();
        }

        if (isMining) {
            setTimeout(runBatch, 0);
        }
    }

    runBatch();
}
