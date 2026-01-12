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
import { Switch } from './ui/switch';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

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

	// Submission Queue State
	const [submissionQueue, setSubmissionQueue] = useState<{ blockId: string; keys: string[]; workerId: string; retries: number; timestamp: number }[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Settings State
	const [autoSubmit, setAutoSubmit] = useState(true);
	const [customStart, setCustomStart] = useState('');
	const [customEnd, setCustomEnd] = useState('');
	const [customLength, setCustomLength] = useState('');
	const [sizeInput, setSizeInput] = useState('');
	const [sizeUnit, setSizeUnit] = useState('1000');
	const [customTargets, setCustomTargets] = useState('');
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	// Settings Draft State (for Dialog)
	const [draftAutoSubmit, setDraftAutoSubmit] = useState(true);
	const [draftCustomStart, setDraftCustomStart] = useState('');
	const [draftCustomEnd, setDraftCustomEnd] = useState('');
	const [draftSizeInput, setDraftSizeInput] = useState('');
	const [draftSizeUnit, setDraftSizeUnit] = useState('1000');
	const [draftCustomTargets, setDraftCustomTargets] = useState('');

	// Load settings and queue from localStorage on mount
	useEffect(() => {
		const savedAutoSubmit = localStorage.getItem('browser-miner-autosubmit');
		const savedSizeInput = localStorage.getItem('browser-miner-blocksize-input');
		const savedSizeUnit = localStorage.getItem('browser-miner-blocksize-unit');

		// Load queue
		try {
			const savedQueue = localStorage.getItem('browser-miner-queue');
			if (savedQueue) {
				const parsed = JSON.parse(savedQueue);
				if (Array.isArray(parsed)) {
					setSubmissionQueue(parsed);
				}
			}
		} catch (e) {
			console.error("Failed to load submission queue", e);
		}

		if (savedAutoSubmit !== null) {
			setAutoSubmit(savedAutoSubmit === 'true');
		}
		if (savedSizeInput) {
			setSizeInput(savedSizeInput);
		}
		if (savedSizeUnit) {
			setSizeUnit(savedSizeUnit);
		}

		// Calculate customLength from saved size
		if (savedSizeInput && savedSizeUnit) {
			const val = parseFloat(savedSizeInput);
			const unit = parseInt(savedSizeUnit);
			if (!isNaN(val) && !isNaN(unit)) {
				setCustomLength(Math.floor(val * unit).toString());
			}
		}
	}, []);

	const openSettings = () => {
		// Initialize draft state with current actual settings
		setDraftAutoSubmit(autoSubmit);
		setDraftCustomStart(customStart);
		setDraftCustomEnd(customEnd);
		setDraftSizeInput(sizeInput);
		setDraftSizeUnit(sizeUnit);
		setDraftCustomTargets(customTargets);

		setIsSettingsOpen(true);
	};

	const saveSettings = () => {
		// Apply draft settings to main state
		setAutoSubmit(draftAutoSubmit);
		setCustomStart(draftCustomStart);
		setCustomEnd(draftCustomEnd);
		setSizeInput(draftSizeInput);
		setSizeUnit(draftSizeUnit);
		setCustomTargets(draftCustomTargets);

		// Calculate customLength
		if (draftSizeInput) {
			const val = parseFloat(draftSizeInput);
			const unit = parseInt(draftSizeUnit);
			if (!isNaN(val)) {
				setCustomLength(Math.floor(val * unit).toString());
			} else {
				setCustomLength('');
			}
		} else {
			setCustomLength('');
		}

		// Persist to localStorage
		localStorage.setItem('browser-miner-autosubmit', draftAutoSubmit.toString());
		localStorage.setItem('browser-miner-blocksize-input', draftSizeInput);
		localStorage.setItem('browser-miner-blocksize-unit', draftSizeUnit);

		setIsSettingsOpen(false);
	};

	const clearCustomSettings = () => {
		// Clear drafts
		setDraftCustomStart('');
		setDraftCustomEnd('');
		setDraftCustomTargets('');
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
		lastAddressUpdate: Date.now(),
		stopRequested: false
	});

	const settingsRef = useRef({ customStart, customEnd, customTargets, customLength, autoSubmit });

	// Keep settingsRef in sync
	useEffect(() => {
		settingsRef.current = { customStart, customEnd, customTargets, customLength, autoSubmit };
	}, [customStart, customEnd, customTargets, customLength, autoSubmit]);

	const workerRef = useRef<Worker | null>(null);
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

	// Persist queue to localStorage whenever it changes
	useEffect(() => {
		localStorage.setItem('browser-miner-queue', JSON.stringify(submissionQueue));
	}, [submissionQueue]);

	// Process Submission Queue
	useEffect(() => {
		if (submissionQueue.length === 0 || isSubmitting) return;

		const processQueue = async () => {
			setIsSubmitting(true);
			const item = submissionQueue[0]; // Process oldest first
			const token = localStorage.getItem('pool-token');

			if (!token) {
				// No token, can't submit. Wait? Or drop? 
				// Better to keep in queue until token is back (user logs in)
				setIsSubmitting(false);
				return;
			}

			try {
				console.log(`Processing queue item: Block ${item.blockId} (Retry ${item.retries})`);
				const response = await fetch('/api/block/submit', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'pool-token': token,
					},
					body: JSON.stringify({
						privateKeys: item.keys,
						blockId: item.blockId,
						workerId: item.workerId
					}),
				});

				if (response.ok) {
					const data = await response.json();
					console.log(`Block ${item.blockId} submitted successfully. Credits: ${data.creditsAwarded || 0}`);
					// Remove from queue
					setSubmissionQueue(prev => prev.slice(1));
				} else {
					// Handle error
					const status = response.status;
					if (status >= 400 && status < 500 && status !== 429) {
						// Fatal error (Bad Request, Unauthorized, etc.) - except Rate Limit
						// Drop it to avoid clogging the queue forever
						console.warn(`Fatal error submitting block ${item.blockId}: ${status}. Dropping.`);
						setSubmissionQueue(prev => prev.slice(1));
					} else {
						// Retryable error (5xx, 429)
						console.warn(`Retryable error submitting block ${item.blockId}: ${status}. Waiting...`);
						// Move to end or just keep at start with backoff?
						// Let's keep at start but increment retry count and maybe wait longer
						// For now, we just wait a bit before setting isSubmitting false
						await new Promise(r => setTimeout(r, 2000));
					}
				}
			} catch (e) {
				console.error(`Network error submitting block ${item.blockId}`, e);
				// Network error, retry later
				await new Promise(r => setTimeout(r, 2000));
			} finally {
				setIsSubmitting(false);
			}
		};

		processQueue();
	}, [submissionQueue, isSubmitting]);

	const submitBlock = useCallback((blockId: string, found: string[]) => {
		// Add to queue instead of submitting directly
		// Always send found keys regardless of autoSubmit setting, as they are required for validation
		const keysToSend = found;

		setSubmissionQueue(prev => [
			...prev,
			{
				blockId,
				keys: keysToSend.length > 0 ? keysToSend : [],
				workerId,
				retries: 0,
				timestamp: Date.now()
			}
		]);
	}, [workerId]);

	const [isStopping, setIsStopping] = useState(false);

	const stopMining = useCallback((force: boolean = false) => {
		// If graceful stop requested and mining is active
		if (!force && engineRef.current.mining) {
			setIsStopping(true);
			engineRef.current.stopRequested = true;
			setStatusMessage('Finishing current block...');
			return;
		}

		// Force stop or actual stop logic
		engineRef.current.mining = false;
		engineRef.current.stopRequested = false;
		setIsMining(false);
		setIsStopping(false);

		if (workerRef.current) {
			workerRef.current.terminate();
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

	const startWorker = useCallback((block: BlockData) => {
		if (workerRef.current) {
			workerRef.current.terminate();
		}

		const worker = new Worker('/miner-worker.js');
		workerRef.current = worker;

		// Send START
		const targets = settingsRef.current.customTargets
			? settingsRef.current.customTargets.split(/[\n,]+/).map(t => t.trim()).filter(t => t)
			: block.checkwork;

		worker.postMessage({
			type: 'START',
			data: {
				start: bigIntToHex64(block.start),
				end: bigIntToHex64(block.end),
				targets: targets,
				puzzleAddress: puzzleAddress
			}
		});

		worker.onerror = (e) => {
			console.error("Worker error:", e);
			setError("Worker error: " + (e.message || "Unknown error"));
			stopMining(true);
		};

		worker.onmessage = async (e) => {
			if (!engineRef.current.mining) return;
			const { type, data, key, isPuzzle } = e.data;

			if (type === 'PROGRESS') {
				const { current, keysScanned: delta, speed: workerSpeed } = data;
				const engine = engineRef.current;

				// Update counters
				engine.totalScanned += delta;
				engine.sessionScanned += delta;

				// Calculate speed (Worker might send 0, we can calc mostly here or use worker provided if we improved it)
				// Use main thread speed calc for now based on delta and time
				const now = Date.now();
				if (now - engine.lastTick > 1000) {
					const elapsed = (now - engine.lastTick) / 1000;
					const currentSpeed = Math.round(engine.sessionScanned / elapsed);
					setSpeed(currentSpeed);
					engine.sessionScanned = 0;
					engine.lastTick = now;
				}

				// Update Progress
				if (engine.currentBlock) {
					const currentBig = parseHexToBigInt(current);
					engine.currentBlock.current = currentBig;

					const total = Number(engine.currentBlock.end - engine.currentBlock.start);
					const done = Number(currentBig - engine.currentBlock.start);
					const pct = (done / total) * 100;

					setProgress(Math.min(100, pct));
					setKeysScanned(engine.totalScanned);
					setCurrentKey('0x' + current);

					// Prefetch Logic (90%)
					const isCustom = settingsRef.current.customStart && settingsRef.current.customEnd;
					if (pct > 90 && !engine.nextBlock && !engine.isFetchingNext && !isCustom) {
						const token = localStorage.getItem('pool-token');
						if (token) {
							engine.isFetchingNext = true;
							fetchBlock(token, true).then(block => {
								if (block) engine.nextBlock = block;
								engine.isFetchingNext = false;
							});
						}
					}
				}
			} else if (type === 'FOUND') {
				const privateKeyHex = key;
				const engine = engineRef.current;

				if (engine.currentBlock) {
					engine.currentBlock.found.push(privateKeyHex);
					setFoundKeys(prev => [...prev, privateKeyHex]);

					if (isPuzzle) {
						setPuzzleKey(privateKeyHex);
						alert(`FOUND PUZZLE KEY: ${privateKeyHex}`);
						if (settingsRef.current.autoSubmit) {
							submitBlock(engine.currentBlock.id, [privateKeyHex]);
						}
						stopMining(true);
					} else {
						// Regular target found
						// Just log/store
					}
				}
			} else if (type === 'FINISHED') {
				const engine = engineRef.current;
				if (!engine.currentBlock) return;

				// Submit (Queue and forget)
				submitBlock(engine.currentBlock.id, engine.currentBlock.found);

				// Custom range check
				if (settingsRef.current.customStart && settingsRef.current.customEnd) {
					setProgress(100);
					setStatusMessage('Custom range finished.');
					stopMining(true);
					return;
				}

				// Check if stop was requested
				if (engine.stopRequested) {
					setProgress(100);
					setStatusMessage('Block finished. Stopping...');
					stopMining(true);
					return;
				}

				// Next block
				if (engine.nextBlock) {
					engine.currentBlock = engine.nextBlock;
					engine.nextBlock = null;
					setActiveBlockId(engine.currentBlock.id);
					setCheckworkAddresses(engine.currentBlock.checkwork);
					setFoundKeys([]);
					setProgress(0);
					setStatusMessage('Mining next block...');

					// Restart worker with new block
					startWorker(engine.currentBlock);
				} else {
					// Fetch next
					setStatusMessage('Fetching next block...');
					const token = localStorage.getItem('pool-token');
					if (token) {
						fetchBlock(token, true).then(block => {
							if (block) {
								engine.currentBlock = block;
								setActiveBlockId(block.id);
								setCheckworkAddresses(block.checkwork);
								setFoundKeys([]);
								setProgress(0);
								startWorker(block);
							} else {
								setError('Failed to fetch next block');
								stopMining(true);
							}
						});
					} else {
						stopMining(true);
					}
				}
			}
		};
	}, [puzzleAddress, fetchBlock, submitBlock, stopMining]);

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
				lastAddressUpdate: Date.now(),
				stopRequested: false
			};

			setActiveBlockId(block.id);
			setFoundKeys([]); // Clear found keys on start
			setIsMining(true);
			setStatusMessage('Mining...');

			// Start Worker
			startWorker(block);

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
			if (workerRef.current) workerRef.current.terminate();
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

	const isCustomModified = !!(customStart && customEnd);

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
												checked={draftAutoSubmit}
												onCheckedChange={(checked) => setDraftAutoSubmit(checked)}
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
											{(draftCustomStart || draftCustomEnd || draftCustomTargets) && (
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
														value={draftCustomStart}
														onChange={(e) => setDraftCustomStart(e.target.value)}
													/>
												</div>
												<div className="space-y-2">
													<Label htmlFor="custom-end" className="text-xs font-medium">End Range</Label>
													<Input
														id="custom-end"
														className="font-mono text-[11px] bg-muted/30 focus-visible:ring-orange-500"
														placeholder="0x0ff..."
														value={draftCustomEnd}
														onChange={(e) => setDraftCustomEnd(e.target.value)}
													/>
												</div>
											</div>

											<div className="grid grid-cols-1 gap-2">
												<Label htmlFor="custom-targets" className="text-xs font-semibold text-gray-500 uppercase">Target Addresses (Optional)</Label>
												<Textarea
													id="custom-targets"
													className="font-mono text-xs min-h-[80px]"
													placeholder="Paste Bitcoin addresses here (one per line or comma separated)..."
													value={draftCustomTargets}
													onChange={(e) => setDraftCustomTargets(e.target.value)}
												/>
												<p className="text-[10px] text-gray-400">
													If provided, only these addresses will be validated in the custom range. Puzzle address is always checked.
												</p>
											</div>

											<div className="grid grid-cols-1 gap-2">
												<Label htmlFor="custom-length" className="text-xs font-semibold text-gray-500 uppercase">Block Size (Keys)</Label>
												<div className="flex gap-2">
													<Input
														id="custom-length"
														className="font-mono flex-1"
														placeholder="Default: 200"
														value={draftSizeInput}
														onChange={(e) => setDraftSizeInput(e.target.value)}
														type="number"
													/>
													<Select
														value={draftSizeUnit}
														onValueChange={(value) => setDraftSizeUnit(value)}
													>
														<SelectTrigger className="w-32">
															<SelectValue placeholder="Unit" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="1000">K (x10³)</SelectItem>
															<SelectItem value="1000000">M (x10⁶)</SelectItem>
															<SelectItem value="1000000000">B (x10⁹)</SelectItem>
														</SelectContent>
													</Select>
												</div>
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
										onClick={saveSettings}
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
							{submissionQueue.length > 0 && (
								<span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
									{submissionQueue.length} pending submit{submissionQueue.length > 1 ? 's' : ''}
								</span>
							)}
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
							<span>{!isStopping && engineRef.current.nextBlock ? 'Next block ready' : '...'}</span>
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
							className={`flex-1 h-12 text-lg font-semibold shadow-sm transition-all ${isStopping
								? 'bg-orange-500 hover:bg-orange-600 active:scale-95'
								: isMining
									? 'bg-red-500 hover:bg-red-600 active:scale-95'
									: (isCustomModified ? 'bg-yellow-500 hover:bg-yellow-600 text-black active:scale-95' : 'bg-green-600 hover:bg-green-700 active:scale-95')
								}`}
							onClick={() => {
								if (isStopping) {
									stopMining(true);
								} else if (isMining) {
									stopMining(false);
								} else {
									startMining();
								}
							}}
						>
							{isStopping ? (
								<>
									<Square className="mr-2 h-5 w-5 animate-pulse" /> Finishing... (Force Stop)
								</>
							) : isMining ? (
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
