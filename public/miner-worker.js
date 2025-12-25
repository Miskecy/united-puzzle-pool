// Web Worker for Browser Mining
// Imports Coinkey for address generation

importScripts('https://bundle.run/coinkey@3.0.0');

// Try to resolve CoinKey from various potential global exports
let CoinKey;
if (typeof self.CoinKey !== 'undefined') {
    CoinKey = self.CoinKey;
} else if (typeof self.coinkey !== 'undefined') {
    CoinKey = self.coinkey;
} else if (typeof module !== 'undefined' && module.exports) {
    CoinKey = module.exports;
} else if (typeof window !== 'undefined' && window.CoinKey) {
    CoinKey = window.CoinKey;
}

if (!CoinKey) {
    console.error('CoinKey library not found or failed to load.');
}
// Also need Buffer polyfill for coinkey if not present in bundle.run
// bundle.run usually includes deps, but let's check.
// If bundle.run fails, we might need a more robust solution, but let's try this.
// Alternative: importScripts('https://unpkg.com/coinkey@3.0.0/dist/coinkey.bundle.js') - doesn't exist on unpkg directly.

// Helper for BigInt <-> Hex
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
    let current = BigInt(startHex);
    const end = BigInt(endHex);

    let keysScannedSinceLastReport = 0;
    let lastReport = Date.now();

    function runBatch() {
        if (!isMining) return;

        // Check if finished
        if (current > end) {
            self.postMessage({ type: 'FINISHED' });
            isMining = false;
            return;
        }

        const batchStart = Date.now();
        let scannedInBatch = 0;

        // Process batch (Time-based for better background performance)
        while (Date.now() - batchStart < 500) {
            if (current > end) break;

            const privateKeyHex = bigIntToHex64(current);

            try {
                // Coinkey usage depends on how it's exposed.
                // bundle.run usually exposes it as module.exports or global.
                // We'll assume 'CoinKey' is available globally or we find it.

                // Polyfill Buffer if missing (browser context)
                if (typeof Buffer === 'undefined') {
                    // Minimal Buffer implementation for Coinkey if needed
                    // Actually Coinkey expects Buffer.
                    // We can use a hex string if Coinkey supports it?
                    // Docs say: new CoinKey(new Buffer(..., 'hex'))
                    // We need a Buffer shim.
                    self.Buffer = {
                        from: (str, enc) => {
                            if (enc === 'hex') {
                                const bytes = new Uint8Array(str.length / 2);
                                for (let i = 0; i < str.length; i += 2) {
                                    bytes[i / 2] = parseInt(
                                        str.substr(i, 2),
                                        16
                                    );
                                }
                                return bytes;
                            }
                            return new Uint8Array([]);
                        },
                    };
                }

                const buffer = self.Buffer.from(privateKeyHex, 'hex');
                const ck = new CoinKey(buffer);
                const address = ck.publicAddress;

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
                // console.error("Crypto error", e);
            }

            current += 1n;
            scannedInBatch++;
        }

        keysScannedSinceLastReport += scannedInBatch;

        // Report progress
        const elapsed = (Date.now() - lastReport) / 1000;
        if (elapsed > 1) {
            // Report every second
            self.postMessage({
                type: 'PROGRESS',
                data: {
                    current: bigIntToHex64(current),
                    keysScanned: keysScannedSinceLastReport, // Send delta
                    speed: 0, // Main thread can calc
                },
            });
            keysScannedSinceLastReport = 0;
            lastReport = Date.now();
        }

        // Continue
        if (isMining) {
            setTimeout(runBatch, 0);
        }
    }

    runBatch();
}
