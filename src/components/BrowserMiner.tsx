'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Play, Square, RefreshCw, Cpu, CheckCircle2, AlertCircle, Settings, Chromium, Copy, Zap } from 'lucide-react';
import CoinKey from 'coinkey';
import { Switch } from './ui/switch';

// Helper functions
function parseHexToBigInt(hex: string): bigint {
	const cleanHex = hex.replace(/^0x/i, '');
	return BigInt('0x' + cleanHex);
}

function bigIntToHex64(n: bigint): string {
	return n.toString(16).padStart(64, '0');
}

function formatTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface BrowserMinerProps {
	puzzleAddress?: string;
	forceShowFoundKey?: boolean;
}

type BlockData = {
	id: string;
	start: bigint;
	end: bigint;
	current: bigint;
	checkwork: string[];
	found: string[];
};

export default function BrowserMiner({ puzzleAddress, forceShowFoundKey }: BrowserMinerProps) {
	// UI State
	const [isMining, setIsMining] = useState(false);
	const [progress, setProgress] = useState(0);
	const [currentKey, setCurrentKey] = useState<string>('0x...');
	const [speed, setSpeed] = useState(0);
	const [keysScanned, setKeysScanned] = useState(0);
	const [foundKeys, setFoundKeys] = useState<string[]>([]);
	const [puzzleKey, setPuzzleKey] = useState<string | null>(null);
	const [checkworkAddresses, setCheckworkAddresses] = useState<string[]>([]);
	const [statusMessage, setStatusMessage] = useState<string>('Ready to start...');
	const [elapsedTime, setElapsedTime] = useState(0);
	const [activeBlockId, setActiveBlockId] = useState<string | null>(null); // For UI display only
	const [error, setError] = useState<string | null>(null);
	const [accordionValue, setAccordionValue] = useState<string>("");

	// Settings State
	const [autoSubmit, setAutoSubmit] = useState(true);
	const [customStart, setCustomStart] = useState('');
	const [customEnd, setCustomEnd] = useState('');
	const [customLength, setCustomLength] = useState('');
	const [customTargets, setCustomTargets] = useState('');
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	const openSettings = () => {
		// Auto-fill with current block data if inputs are empty and we have a block
		if (engineRef.current.currentBlock && !customStart && !customEnd) {
			setCustomStart('0x' + bigIntToHex64(engineRef.current.currentBlock.start));
			setCustomEnd('0x' + bigIntToHex64(engineRef.current.currentBlock.end));
			setCustomLength((engineRef.current.currentBlock.end - engineRef.current.currentBlock.start).toString());
		}
		setIsSettingsOpen(true);
	};

	const clearCustomSettings = () => {
		setCustomStart('');
		setCustomEnd('');
		setCustomLength('');
		setCustomTargets('');
	};

	// Unique worker ID for this browser session to allow parallel mining
	const [workerId] = useState(() => 'browser-' + Math.random().toString(36).substring(2, 11));

	// Engine State (Refs for performance and continuous loop)
	const engineRef = useRef({
		mining: false,
		currentBlock: null as BlockData | null,
		nextBlock: null as BlockData | null,
		isFetchingNext: false,
		startTime: 0,
		totalScanned: 0,
		sessionScanned: 0,
		lastTick: Date.now(),
		lastAddressUpdate: Date.now()
	});

	const settingsRef = useRef({ customStart, customEnd, customTargets, customLength, autoSubmit });

	// Keep settingsRef in sync
	useEffect(() => {
		settingsRef.current = { customStart, customEnd, customTargets, customLength, autoSubmit };
	}, [customStart, customEnd, customTargets, customLength, autoSubmit]);

	const workerRef = useRef<NodeJS.Timeout | null>(null);
	const timerRef = useRef<NodeJS.Timeout | null>(null);

	// Helper to fetch a block
	const fetchBlock = useCallback(async (token: string, skipActive: boolean = false): Promise<BlockData | null> => {
		try {
			let url = `/api/block?workerId=${workerId}`;
			if (skipActive) url += '&skipActive=true';
			const { customStart, customEnd, customLength } = settingsRef.current;

			if (customStart && customEnd) {
				url += `&start=${customStart}&end=${customEnd}`;
			} else if (customLength) {
				url += `&length=${customLength}&random=true`;
			} else {
				url += `&length=200000&random=true`;
			}

			const response = await fetch(url, {
				headers: { 'pool-token': token }
			});

			if (!response.ok) {
				const err = await response.json();
				throw new Error(err.error || 'Failed to get block');
			}

			const data = await response.json();
			return {
				id: data.id,
				start: parseHexToBigInt(data.range.start),
				end: parseHexToBigInt(data.range.end),
				current: parseHexToBigInt(data.range.start),
				checkwork: data.checkwork_addresses || [],
				found: []
			};
		} catch (e) {
			console.error("Fetch block error:", e);
			return null;
		}
	}, [workerId]);

	const submitBlock = useCallback(async (blockId: string, found: string[]) => {
		try {
			const token = localStorage.getItem('pool-token');
			if (!token) return;

			// If autoSubmit is disabled, don't send keys (unless it's the puzzle key? But we can't distinguish easily here without address check)
			// Assuming autoSubmit controls ALL key submissions to DB.
			const keysToSend = settingsRef.current.autoSubmit ? found : [];

			// Fire and forget, don't await in the loop
			fetch('/api/block/submit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'pool-token': token,
				},
				body: JSON.stringify({
					privateKeys: keysToSend.length > 0 ? keysToSend : [],
					blockId: blockId,
					workerId: workerId
				}),
			}).then(res => res.json()).then(data => {
				console.log(`Block ${blockId} submitted. Credits: ${data.creditsAwarded || 0}`);
			}).catch(e => console.error('Submit error:', e));
		} catch (e) {
			console.error('Error submitting block:', e);
		}
	}, [workerId]);

	const stopMining = useCallback(() => {
		engineRef.current.mining = false;
		setIsMining(false);
		if (workerRef.current) {
			clearTimeout(workerRef.current);
			workerRef.current = null;
		}
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}

		// Clear active block in Redis
		const token = localStorage.getItem('pool-token');
		if (token) {
			fetch(`/api/block?workerId=${workerId}`, {
				method: 'DELETE',
				headers: { 'pool-token': token }
			}).catch(() => { });
		}

		// Final update of elapsed time
		if (engineRef.current.startTime > 0) {
			setElapsedTime(Date.now() - engineRef.current.startTime);
		}
		setStatusMessage(`Stopped. Ran for ${formatTime(Date.now() - engineRef.current.startTime)}`);
	}, [workerId]);

	const mineLoop = useCallback(async () => {
		const engine = engineRef.current;
		if (!engine.mining || !engine.currentBlock) return;

		const BATCH_SIZE = 500; // Increased batch size for 200k blocks
		const { currentBlock } = engine;
		let current = currentBlock.current;
		const end = currentBlock.end;

		// 1. Process Batch
		for (let i = 0; i < BATCH_SIZE; i++) {
			if (current > end) {
				// Block Finished
				// Submit results
				submitBlock(currentBlock.id, currentBlock.found);

				// If we are in a custom range mode, stop here
				if (settingsRef.current.customStart && settingsRef.current.customEnd) {
					// Force UI to 100% and update final stats
					setProgress(100);
					setKeysScanned(engine.totalScanned + i);
					setStatusMessage('Custom range finished.');
					stopMining();
					return;
				}

				// Switch to next block
				if (engine.nextBlock) {
					engine.currentBlock = engine.nextBlock;
					engine.nextBlock = null;
					engine.isFetchingNext = false;
					// Reset local vars for next iteration immediately
					current = engine.currentBlock.current;
					setActiveBlockId(engine.currentBlock.id);
					setCheckworkAddresses(engine.currentBlock.checkwork);
					setFoundKeys([]); // Clear found keys for new block
					setProgress(0);
					setStatusMessage('Mining next block...');
					break; // Break inner loop to restart with new block
				} else {
					// No next block yet? Wait a bit or try to fetch immediately if not fetching
					if (!engine.isFetchingNext) {
						setStatusMessage('Fetching next block...');
						const token = localStorage.getItem('pool-token');
						if (token) {
							engine.isFetchingNext = true;
							fetchBlock(token, true).then(block => {
								if (block) {
									engine.currentBlock = block;
									engine.isFetchingNext = false;
									setActiveBlockId(block.id);
									setCheckworkAddresses(block.checkwork);
									mineLoop(); // Restart loop
								} else {
									setError('Failed to fetch next block');
									stopMining();
								}
							});
						}
						return; // Exit loop, fetch callback will restart
					}
					// If already fetching, just wait (reschedule)
					workerRef.current = setTimeout(mineLoop, 100);
					return;
				}
			}

			const privateKeyHex = bigIntToHex64(current);

			try {
				const buffer = Buffer.from(privateKeyHex, 'hex');
				const ck = new CoinKey(buffer);
				const address = ck.publicAddress;

				if (puzzleAddress && address === puzzleAddress) {
					currentBlock.found.push(privateKeyHex);
					setFoundKeys(prev => [...prev, privateKeyHex]);
					setPuzzleKey(privateKeyHex);
					if (settingsRef.current.autoSubmit) {
						submitBlock(currentBlock.id, [privateKeyHex]);
					}
					alert(`FOUND PUZZLE KEY: ${privateKeyHex}`);
					stopMining();
					return;
				}

				// Check against custom targets if provided, otherwise check against block checkwork
				const targets = settingsRef.current.customTargets
					? settingsRef.current.customTargets.split(/[\n,]+/).map(t => t.trim()).filter(t => t)
					: currentBlock.checkwork;

				if (targets.length > 0 && targets.includes(address)) {
					currentBlock.found.push(privateKeyHex);
					setFoundKeys(prev => [...prev, privateKeyHex]);
				}
			} catch (e) {
				console.error("Crypto error:", e);
				stopMining();
				return;
			}

			current += 1n;
		}

		// Update Refs
		engine.currentBlock.current = current;
		engine.sessionScanned += BATCH_SIZE;
		engine.totalScanned += BATCH_SIZE;

		// 2. Prefetch Logic (at 90%)
		const total = Number(engine.currentBlock.end - engine.currentBlock.start);
		const done = Number(current - engine.currentBlock.start);
		const pct = (done / total) * 100;

		const isCustom = settingsRef.current.customStart && settingsRef.current.customEnd;

		if (pct > 90 && !engine.nextBlock && !engine.isFetchingNext) {
			// Don't prefetch if we are in custom range mode

			if (!isCustom) {
				const token = localStorage.getItem('pool-token');
				if (token) {
					engine.isFetchingNext = true;
					// Fetch in background
					fetchBlock(token, true).then(block => {
						if (block) {
							engine.nextBlock = block;
						}
						engine.isFetchingNext = false;
					});
				}
			}
		}

		if (isCustom && pct >= 100) {
			setStatusMessage('Custom range completed.');
			stopMining();
			return;
		}

		// 3. UI Updates (throttled)
		const now = Date.now();

		// Update UI more frequently for "rolling" effect
		if (now - engine.lastAddressUpdate > 60) {
			setCurrentKey('0x' + bigIntToHex64(current));
			engine.lastAddressUpdate = now;
		}

		if (now - engine.lastTick > 1000) {
			const elapsed = (now - engine.lastTick) / 1000;
			const currentSpeed = Math.round(engine.sessionScanned / elapsed);

			setSpeed(currentSpeed);
			setKeysScanned(engine.totalScanned);
			setProgress(Math.min(100, pct));
			// Key updated in fast loop above

			setElapsedTime(now - engine.startTime);

			engine.sessionScanned = 0;
			engine.lastTick = now;
		}

		// 4. Schedule next
		workerRef.current = setTimeout(mineLoop, 0);
	}, [puzzleAddress, stopMining, fetchBlock, submitBlock]); // foundKeys dependency is tricky, better to use ref for found keys if we want perfect accuracy, but state is okay for display

	const startMining = async () => {
		try {
			setError(null);
			const token = localStorage.getItem('pool-token');
			if (!token) {
				setError('No token found. Please login first.');
				return;
			}

			setStatusMessage('Initializing...');

			// Initial Fetch with retry logic
			let block: BlockData | null = null;
			for (let i = 0; i < 3; i++) {
				block = await fetchBlock(token);
				if (block) break;
				setStatusMessage(`Retrying fetch block (${i + 1}/3)...`);
				await new Promise(r => setTimeout(r, 1000));
			}

			if (!block) {
				setError('Failed to fetch initial block after retries');
				return;
			}

			// Setup Engine
			engineRef.current = {
				mining: true,
				currentBlock: block,
				nextBlock: null,
				isFetchingNext: false,
				startTime: Date.now(),
				totalScanned: 0,
				sessionScanned: 0,
				lastTick: Date.now(),
				lastAddressUpdate: Date.now()
			};

			setActiveBlockId(block.id);
			setFoundKeys([]); // Clear found keys on start
			setIsMining(true);
			setStatusMessage('Mining...');

			// Start Loop
			mineLoop();

			// Start Timer for UI
			timerRef.current = setInterval(() => {
				if (engineRef.current.mining) {
					setElapsedTime(Date.now() - engineRef.current.startTime);
				}
			}, 1000);

		} catch (e) {
			console.error(e);
			setError('Failed to start mining');
		}
	};

	// Cleanup
	useEffect(() => {
		return () => {
			if (workerRef.current) clearTimeout(workerRef.current);
			if (timerRef.current) clearInterval(timerRef.current);
			engineRef.current.mining = false;
		};
	}, []);

	// Auto-expand accordion when puzzle key is found
	useEffect(() => {
		if (puzzleKey) {
			setAccordionValue("puzzle-key");
		}
	}, [puzzleKey]);

	// Force expand found keys accordion if prop is true
	useEffect(() => {
		if (forceShowFoundKey) {
			setAccordionValue("puzzle-key");
		}
	}, [forceShowFoundKey]);

	const isCustomModified = !!(customStart || customEnd || customLength);

	return (
		<div className="space-y-6">
			<Card className="border shadow-md">
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<Chromium className="h-5 w-5 text-blue-600" />
							Browser Mining
						</CardTitle>
						<Button variant="ghost" size="icon" onClick={openSettings}>
							<Settings className="h-5 w-5" />
						</Button>
						<Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
							<DialogContent className="sm:max-w-[500px] overflow-hidden p-0">
								<DialogHeader className="p-6 pb-0">
									<div className="flex items-center gap-3">
										<div className="p-2 bg-primary/10 rounded-lg">
											<Settings className="h-5 w-5 text-primary" />
										</div>
										<div>
											<DialogTitle className="text-xl">Mining Configuration</DialogTitle>
											<DialogDescription>
												Customize your browser mining strategy and automation.
											</DialogDescription>
										</div>
									</div>
								</DialogHeader>

								<div className="p-6 space-y-6">
									{/* Automation Card */}
									<div className="relative overflow-hidden rounded-xl border bg-card p-4 transition-all hover:shadow-sm">
										<div className="flex items-start justify-between gap-4">
											<div className="space-y-1">
												<Label htmlFor="autosubmit" className="text-sm font-semibold flex items-center gap-2">
													<Zap className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
													Auto-submit Results
												</Label>
												<p className="text-xs text-muted-foreground leading-relaxed">
													Found private keys will be instantly synchronized with the central database.
												</p>
											</div>
											<Switch
												id="autosubmit"
												checked={autoSubmit}
												onCheckedChange={(checked) => setAutoSubmit(checked)}
											/>
										</div>
									</div>

									{/* Range Strategy Section */}
									<div className="space-y-4">
										<div className="flex items-center justify-between border-b pb-2">
											<h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
												<Cpu className="h-3.5 w-3.5" />
												Range Strategy
											</h4>
											{(customStart || customEnd || customLength) && (
												<Button
													variant="link"
													size="sm"
													onClick={clearCustomSettings}
													className="h-auto p-0 text-xs text-destructive hover:no-underline shadow-none bg-transparent hover:bg-transparent hover:text-red-800 hover:shadow-none"
												>
													<RefreshCw className="h-3 w-3 mr-1" />
													Reset to Random
												</Button>
											)}
										</div>

										<div className="grid gap-4">
											<div className="grid grid-cols-2 gap-4">
												<div className="space-y-2">
													<Label htmlFor="custom-start" className="text-xs font-medium">Start Range</Label>
													<Input
														id="custom-start"
														className="font-mono text-[11px] bg-muted/30 focus-visible:ring-orange-500"
														placeholder="0x000..."
														value={customStart}
														onChange={(e) => setCustomStart(e.target.value)}
													/>
												</div>
												<div className="space-y-2">
													<Label htmlFor="custom-end" className="text-xs font-medium">End Range</Label>
													<Input
														id="custom-end"
														className="font-mono text-[11px] bg-muted/30 focus-visible:ring-orange-500"
														placeholder="0x0ff..."
														value={customEnd}
														onChange={(e) => setCustomEnd(e.target.value)}
													/>
												</div>
											</div>

											<div className="grid grid-cols-1 gap-2">
												<Label htmlFor="custom-targets" className="text-xs font-semibold text-gray-500 uppercase">Target Addresses (Optional)</Label>
												<Textarea
													id="custom-targets"
													className="font-mono text-xs min-h-[80px]"
													placeholder="Paste Bitcoin addresses here (one per line or comma separated)..."
													value={customTargets}
													onChange={(e) => setCustomTargets(e.target.value)}
												/>
												<p className="text-[10px] text-gray-400">
													If provided, only these addresses will be validated in the custom range. Puzzle address is always checked.
												</p>
											</div>

											<div className="grid grid-cols-1 gap-2">
												<Label htmlFor="custom-length" className="text-xs font-semibold text-gray-500 uppercase">Block Size (Keys)</Label>
												<Input
													id="custom-length"
													className="font-mono"
													placeholder="Default: 200000"
													value={customLength}
													onChange={(e) => setCustomLength(e.target.value)}
													type="number"
												/>
												<p className="text-[10px] text-gray-400">
													Leave empty for default (200,000 keys/block).
												</p>
											</div>
										</div>
									</div>
								</div>

								<DialogFooter className="bg-muted/30 p-4 border-t gap-2">
									<Button variant="ghost" onClick={() => setIsSettingsOpen(false)}>
										Discard
									</Button>
									<Button
										onClick={() => setIsSettingsOpen(false)}
										className="px-8 shadow-sm"
									>
										Save Configuration
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
					<CardDescription>
						Continuous browser-based mining. Keeps fetching new blocks automatically.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
						<div className="space-y-1">
							<p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</p>
							<div className="flex items-center gap-2">
								<Badge variant={isMining ? "default" : "secondary"} className={isMining ? "bg-green-500 hover:bg-green-600 transition-colors" : "bg-gray-200 text-gray-700"}>
									{isMining ? "Mining Active" : "Idle"}
								</Badge>
								{isMining && <span className="relative flex h-3 w-3">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
									<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
								</span>}
							</div>
						</div>
						<div className="space-y-1 text-right">
							<p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Speed</p>
							<p className="text-2xl font-bold font-mono text-gray-900">{speed.toLocaleString()} <span className="text-sm text-gray-500 font-normal">Keys/s</span></p>
						</div>
					</div>

					{error && (
						<div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700 text-sm">
							<AlertCircle className="h-4 w-4" />
							{error}
						</div>
					)}

					<div className="space-y-2">
						<div className="flex justify-between text-sm font-medium text-gray-700">
							<span>Progress (Block {activeBlockId?.slice(0, 8)}...)</span>
							<span>{progress.toFixed(1)}%</span>
						</div>
						<div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden shadow-inner relative">
							<div
								className="h-full bg-linear-to-r from-orange-400 to-red-500 transition-all duration-300 ease-out relative"
								style={{ width: `${progress}%` }}
							>
								{isMining && <div className="absolute top-0 right-0 bottom-0 w-1 bg-white/50 animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>}
							</div>
						</div>
						<div className="flex justify-between text-xs text-gray-500 font-mono">
							<span>{keysScanned.toLocaleString()} keys scanned total</span>
							<span>{engineRef.current.nextBlock ? 'Next block ready' : '...'}</span>
						</div>
						{engineRef.current.currentBlock && (
							<div className="flex flex-col gap-1 text-[10px] text-gray-400 font-mono bg-gray-50 p-2 rounded border border-gray-100">
								<div className="flex justify-between">
									<span className="font-bold text-gray-500">Start:</span>
									<span title="Start Range" className="break-all text-right">0x{bigIntToHex64(engineRef.current.currentBlock.start)}</span>
								</div>
								<div className="flex justify-between">
									<span className="font-bold text-gray-500">End:</span>
									<span title="End Range" className="break-all text-right">0x{bigIntToHex64(engineRef.current.currentBlock.end)}</span>
								</div>
							</div>
						)}
					</div>

					<div className="space-y-2">
						<label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Current Key Range Scanner</label>
						<div className="p-4 bg-black rounded-lg font-mono text-xs break-all h-24 overflow-y-auto flex flex-col justify-center text-green-400 shadow-inner border border-gray-800 relative">
							{isMining ? (
								<>
									<div className="text-center text-gray-500 text-[10px] mb-1">Scanning Key...</div>
									<div className="text-sm font-bold text-green-300 shadow-green-500/20 drop-shadow-sm my-1 text-center break-all leading-tight">
										{currentKey}
									</div>
									<div className="absolute top-2 right-2">
										<div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
									</div>
								</>
							) : (
								<div className="text-gray-500 text-center italic">{statusMessage}</div>
							)}
						</div>
					</div>

					<div className="flex gap-4 pt-2">
						<Button
							className={`flex-1 h-12 text-lg font-semibold shadow-sm transition-all ${isMining ? 'bg-red-500 hover:bg-red-600 active:scale-95' : (isCustomModified ? 'bg-yellow-500 hover:bg-yellow-600 text-black active:scale-95' : 'bg-green-600 hover:bg-green-700 active:scale-95')}`}
							onClick={isMining ? stopMining : startMining}
						>
							{isMining ? (
								<>
									<Square className="mr-2 h-5 w-5" /> Stop ({formatTime(elapsedTime)})
								</>
							) : (
								<>
									<Play className="mr-2 h-5 w-5" /> Start Mining
								</>
							)}
						</Button>
						<Button variant="outline" className="h-12 w-12 p-0 border-gray-300 hover:bg-gray-100" onClick={() => {
							setProgress(0);
							setKeysScanned(0);
							setFoundKeys([]);
							setPuzzleKey(null);
							setCheckworkAddresses([]);
							setSpeed(0);
							setCurrentKey('0x...');
							setStatusMessage('Ready to start...');
							setElapsedTime(0);
							setError(null);
						}} title="Reset Miner">
							<RefreshCw className="h-5 w-5 text-gray-600" />
						</Button>
					</div>

					{(foundKeys.length > 0 || puzzleKey || checkworkAddresses.length > 0 || forceShowFoundKey) && (
						<Accordion type="single" collapsible className="w-full mt-4" value={accordionValue} onValueChange={setAccordionValue}>
							{(puzzleKey || forceShowFoundKey) && (
								<AccordionItem value="puzzle-key" className="border-red-500 bg-red-50 rounded-md mb-2 px-2">
									<AccordionTrigger className="text-red-700 font-bold animate-pulse hover:no-underline">
										🚨 PUZZLE KEY FOUND 🚨
									</AccordionTrigger>
									<AccordionContent>
										<div className="p-4 bg-white border border-red-200 rounded text-red-600 font-mono text-lg break-all select-all">
											{puzzleKey || "0000000000000000000000000000000000000000000000000000000000000001 (MOCK)"}
										</div>
									</AccordionContent>
								</AccordionItem>
							)}

							{/* Target keys accordion removed as per user request */}

							<AccordionItem value="validation-keys" className="border rounded-md px-2 bg-green-50/50 border-green-200">
								<AccordionTrigger
									className="text-green-800 hover:no-underline pr-2"
									actions={
										<Button
											variant="ghost"
											size="sm"
											className="h-7 w-7 p-0 text-green-700 hover:bg-green-100 rounded-full"
											title="Copy All Keys"
											onClick={(e) => {
												e.stopPropagation();
												const keys = foundKeys.filter(k => k !== puzzleKey).join('\n');
												navigator.clipboard.writeText(keys);
												alert(`Copied ${foundKeys.filter(k => k !== puzzleKey).length} keys to clipboard!`);
											}}
										>
											<Copy className="h-4 w-4" />
										</Button>
									}
								>
									<div className="flex items-center gap-2 flex-1">
										<CheckCircle2 className="h-5 w-5" />
										<span>Found Validation Keys ({foundKeys.filter(k => k !== puzzleKey).length})</span>
									</div>
								</AccordionTrigger>
								<AccordionContent>
									<ul className="space-y-1 max-h-40 overflow-y-auto pt-2">
										{foundKeys.filter(k => k !== puzzleKey).map((k, i) => (
											<li key={i} className="text-xs font-mono text-green-700 bg-green-100 px-2 py-1 rounded border border-green-200">{k}</li>
										))}
									</ul>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					)}
				</CardContent>
			</Card>
		</div >
	);
}
