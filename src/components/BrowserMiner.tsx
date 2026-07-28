'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, RefreshCw, Cpu, CheckCircle2, AlertCircle, Settings, Chromium, Copy, Zap, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/contexts/LanguageContext';

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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<button
			type="button"
			onClick={() => onChange(!checked)}
			className="relative inline-flex items-center h-6 w-11 rounded-full transition-colors shrink-0"
			style={{ background: checked ? '#fc5c04' : '#262624', border: `1px solid ${checked ? '#fc5c04' : '#3d3c38'}` }}
		>
			<span
				className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
				style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
			/>
		</button>
	);
}

export default function BrowserMiner({ puzzleAddress, forceShowFoundKey }: BrowserMinerProps) {
	const { t } = useTranslation();
	const [isMining, setIsMining] = useState(false);
	const [progress, setProgress] = useState(0);
	const [currentKey, setCurrentKey] = useState<string>('0x...');
	const [speed, setSpeed] = useState(0);
	const [keysScanned, setKeysScanned] = useState(0);
	const [foundKeys, setFoundKeys] = useState<string[]>([]);
	const [puzzleKey, setPuzzleKey] = useState<string | null>(null);
	const [checkworkAddresses, setCheckworkAddresses] = useState<string[]>([]);
	const [statusMessage, setStatusMessage] = useState<string>('');
	const [elapsedTime, setElapsedTime] = useState(0);
	const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [puzzleOpen, setPuzzleOpen] = useState(false);
	const [validationOpen, setValidationOpen] = useState(false);

	const [submissionQueue, setSubmissionQueue] = useState<{ blockId: string; keys: string[]; workerId: string; retries: number; timestamp: number }[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const [autoSubmit, setAutoSubmit] = useState(true);
	const [customStart, setCustomStart] = useState('');
	const [customEnd, setCustomEnd] = useState('');
	const [customLength, setCustomLength] = useState('');
	const [sizeInput, setSizeInput] = useState('');
	const [sizeUnit, setSizeUnit] = useState('1000');
	const [customTargets, setCustomTargets] = useState('');
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	const [draftAutoSubmit, setDraftAutoSubmit] = useState(true);
	const [draftCustomStart, setDraftCustomStart] = useState('');
	const [draftCustomEnd, setDraftCustomEnd] = useState('');
	const [draftSizeInput, setDraftSizeInput] = useState('');
	const [draftSizeUnit, setDraftSizeUnit] = useState('1000');
	const [draftCustomTargets, setDraftCustomTargets] = useState('');

	const tRef = useRef(t);
	useEffect(() => { tRef.current = t; }, [t]);

	useEffect(() => {
		const savedAutoSubmit = localStorage.getItem('browser-miner-autosubmit');
		const savedSizeInput = localStorage.getItem('browser-miner-blocksize-input');
		const savedSizeUnit = localStorage.getItem('browser-miner-blocksize-unit');

		try {
			const savedQueue = localStorage.getItem('browser-miner-queue');
			if (savedQueue) {
				const parsed = JSON.parse(savedQueue);
				if (Array.isArray(parsed)) setSubmissionQueue(parsed);
			}
		} catch (e) {
			console.error('Failed to load submission queue', e);
		}

		if (savedAutoSubmit !== null) setAutoSubmit(savedAutoSubmit === 'true');
		if (savedSizeInput) setSizeInput(savedSizeInput);
		if (savedSizeUnit) setSizeUnit(savedSizeUnit);

		if (savedSizeInput && savedSizeUnit) {
			const val = parseFloat(savedSizeInput);
			const unit = parseInt(savedSizeUnit);
			if (!isNaN(val) && !isNaN(unit)) setCustomLength(Math.floor(val * unit).toString());
		}
	}, []);

	const openSettings = () => {
		setDraftAutoSubmit(autoSubmit);
		setDraftCustomStart(customStart);
		setDraftCustomEnd(customEnd);
		setDraftSizeInput(sizeInput);
		setDraftSizeUnit(sizeUnit);
		setDraftCustomTargets(customTargets);
		setIsSettingsOpen(true);
	};

	const saveSettings = () => {
		setAutoSubmit(draftAutoSubmit);
		setCustomStart(draftCustomStart);
		setCustomEnd(draftCustomEnd);
		setSizeInput(draftSizeInput);
		setSizeUnit(draftSizeUnit);
		setCustomTargets(draftCustomTargets);

		if (draftSizeInput) {
			const val = parseFloat(draftSizeInput);
			const unit = parseInt(draftSizeUnit);
			if (!isNaN(val)) setCustomLength(Math.floor(val * unit).toString());
			else setCustomLength('');
		} else {
			setCustomLength('');
		}

		localStorage.setItem('browser-miner-autosubmit', draftAutoSubmit.toString());
		localStorage.setItem('browser-miner-blocksize-input', draftSizeInput);
		localStorage.setItem('browser-miner-blocksize-unit', draftSizeUnit);
		setIsSettingsOpen(false);
	};

	const clearCustomSettings = () => {
		setDraftCustomStart('');
		setDraftCustomEnd('');
		setDraftCustomTargets('');
	};

	const [workerId] = useState(() => 'browser-' + Math.random().toString(36).substring(2, 11));

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

	useEffect(() => {
		settingsRef.current = { customStart, customEnd, customTargets, customLength, autoSubmit };
	}, [customStart, customEnd, customTargets, customLength, autoSubmit]);

	const workerRef = useRef<Worker | null>(null);
	const timerRef = useRef<NodeJS.Timeout | null>(null);

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

			const response = await fetch(url, { headers: { 'pool-token': token } });
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
			console.error('Fetch block error:', e);
			return null;
		}
	}, [workerId]);

	useEffect(() => {
		localStorage.setItem('browser-miner-queue', JSON.stringify(submissionQueue));
	}, [submissionQueue]);

	useEffect(() => {
		if (submissionQueue.length === 0 || isSubmitting) return;

		const processQueue = async () => {
			setIsSubmitting(true);
			const item = submissionQueue[0];
			const token = localStorage.getItem('pool-token');

			if (!token) { setIsSubmitting(false); return; }

			try {
				const response = await fetch('/api/block/submit', {
					method: 'POST',
					keepalive: true,
					headers: { 'Content-Type': 'application/json', 'pool-token': token },
					body: JSON.stringify({ privateKeys: item.keys, blockId: item.blockId, workerId: item.workerId }),
				});

				if (response.ok) {
					const data = await response.json();
					console.log(`Block ${item.blockId} submitted. Credits: ${data.creditsAwarded || 0}`);
					setSubmissionQueue(prev => prev.slice(1));
				} else {
					const status = response.status;
					if (status >= 400 && status < 500 && status !== 429) {
						try { const eb = await response.text(); console.warn('Error body:', eb); } catch { }
						setSubmissionQueue(prev => prev.slice(1));
					} else {
						await new Promise(r => setTimeout(r, 2000));
					}
				}
			} catch (e) {
				console.error(`Network error submitting block ${item.blockId}`, e);
				await new Promise(r => setTimeout(r, 2000));
			} finally {
				setIsSubmitting(false);
			}
		};

		processQueue();
	}, [submissionQueue, isSubmitting]);

	const submitBlock = useCallback((blockId: string, found: string[]) => {
		setSubmissionQueue(prev => [...prev, { blockId, keys: found.length > 0 ? found : [], workerId, retries: 0, timestamp: Date.now() }]);
	}, [workerId]);

	const [isStopping, setIsStopping] = useState(false);

	const stopMining = useCallback((force: boolean = false, skipDelete: boolean = false) => {
		if (!force && engineRef.current.mining) {
			setIsStopping(true);
			engineRef.current.stopRequested = true;
			setStatusMessage(tRef.current('browserMiner.messages.finishingCurrent'));
			return;
		}

		engineRef.current.mining = false;
		engineRef.current.stopRequested = false;
		setIsMining(false);
		setIsStopping(false);

		if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
		if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

		const token = localStorage.getItem('pool-token');
		if (token && !skipDelete) {
			fetch(`/api/block?workerId=${workerId}`, { method: 'DELETE', headers: { 'pool-token': token } }).catch(() => { });
		}

		if (engineRef.current.startTime > 0) setElapsedTime(Date.now() - engineRef.current.startTime);
		setStatusMessage(tRef.current('browserMiner.messages.stoppedFor').replace('{time}', formatTime(Date.now() - engineRef.current.startTime)));
	}, [workerId]);

	const startWorker = useCallback((block: BlockData) => {
		if (workerRef.current) workerRef.current.terminate();

		const worker = new Worker('/miner-worker.js');
		workerRef.current = worker;

		const targets = settingsRef.current.customTargets
			? settingsRef.current.customTargets.split(/[\n,]+/).map(v => v.trim()).filter(v => v)
			: block.checkwork;

		worker.postMessage({
			type: 'START',
			data: { start: bigIntToHex64(block.start), end: bigIntToHex64(block.end), targets, puzzleAddress }
		});

		worker.onerror = (e) => {
			console.error('Worker error:', e);
			setError(tRef.current('browserMiner.messages.workerError') + ' ' + (e.message || 'Unknown error'));
			stopMining(true);
		};

		worker.onmessage = async (e) => {
			if (!engineRef.current.mining) return;
			const { type, data, key, isPuzzle } = e.data;

			if (type === 'PROGRESS') {
				const { current, keysScanned: delta } = data;
				const engine = engineRef.current;

				engine.totalScanned += delta;
				engine.sessionScanned += delta;

				const now = Date.now();
				if (now - engine.lastTick > 1000) {
					const elapsed = (now - engine.lastTick) / 1000;
					setSpeed(Math.round(engine.sessionScanned / elapsed));
					engine.sessionScanned = 0;
					engine.lastTick = now;
				}

				if (engine.currentBlock) {
					const currentBig = parseHexToBigInt(current);
					engine.currentBlock.current = currentBig;

					const total = Number(engine.currentBlock.end - engine.currentBlock.start);
					const done = Number(currentBig - engine.currentBlock.start);
					const pct = (done / total) * 100;

					setProgress(Math.min(100, pct));
					setKeysScanned(engine.totalScanned);
					setCurrentKey('0x' + current);

					const isCustom = settingsRef.current.customStart && settingsRef.current.customEnd;
					if (pct > 90 && !engine.nextBlock && !engine.isFetchingNext && !isCustom) {
						const token = localStorage.getItem('pool-token');
						if (token) {
							engine.isFetchingNext = true;
							fetchBlock(token, true).then(nextBlock => {
								if (nextBlock) engine.nextBlock = nextBlock;
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
						submitBlock(engine.currentBlock.id, [privateKeyHex]);
						toast.success(tRef.current('browserMiner.results.puzzleFoundToast').replace('{key}', privateKeyHex), {
							duration: 10000,
							action: { label: tRef.current('common.copy'), onClick: () => navigator.clipboard.writeText(privateKeyHex) }
						});
						stopMining(true, true);
					}
				}
			} else if (type === 'FINISHED') {
				const engine = engineRef.current;
				if (!engine.currentBlock) return;

				submitBlock(engine.currentBlock.id, engine.currentBlock.found);

				if (settingsRef.current.customStart && settingsRef.current.customEnd) {
					setProgress(100);
					setStatusMessage(tRef.current('browserMiner.messages.customFinished'));
					stopMining(true);
					return;
				}

				if (engine.stopRequested) {
					setProgress(100);
					setStatusMessage(tRef.current('browserMiner.messages.blockFinished'));
					stopMining(true);
					return;
				}

				if (engine.nextBlock) {
					engine.currentBlock = engine.nextBlock;
					engine.nextBlock = null;
					setActiveBlockId(engine.currentBlock.id);
					setCheckworkAddresses(engine.currentBlock.checkwork);
					setFoundKeys([]);
					setProgress(0);
					setStatusMessage(tRef.current('browserMiner.messages.miningNext'));
					startWorker(engine.currentBlock);
				} else {
					setStatusMessage(tRef.current('browserMiner.messages.fetchingNext'));
					const token = localStorage.getItem('pool-token');
					if (token) {
						fetchBlock(token, true).then(nextBlock => {
							if (nextBlock) {
								engine.currentBlock = nextBlock;
								setActiveBlockId(nextBlock.id);
								setCheckworkAddresses(nextBlock.checkwork);
								setFoundKeys([]);
								setProgress(0);
								startWorker(nextBlock);
							} else {
								setError(tRef.current('browserMiner.messages.failedFetchNext'));
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
			if (!token) { setError(t('browserMiner.messages.noToken')); return; }

			setStatusMessage(t('browserMiner.messages.initializing'));
			let block: BlockData | null = null;
			for (let i = 0; i < 3; i++) {
				block = await fetchBlock(token);
				if (block) break;
				setStatusMessage(t('browserMiner.messages.retrying').replace('{n}', `${i + 1}`));
				await new Promise(r => setTimeout(r, 1000));
			}

			if (!block) { setError(t('browserMiner.messages.failedInitial')); return; }

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
			setFoundKeys([]);
			setIsMining(true);
			setStatusMessage(t('browserMiner.messages.mining'));
			startWorker(block);

			timerRef.current = setInterval(() => {
				if (engineRef.current.mining) setElapsedTime(Date.now() - engineRef.current.startTime);
			}, 1000);
		} catch (e) {
			console.error(e);
			setError(t('browserMiner.messages.failedStart'));
		}
	};

	useEffect(() => {
		return () => {
			if (workerRef.current) workerRef.current.terminate();
			if (timerRef.current) clearInterval(timerRef.current);
			engineRef.current.mining = false;
		};
	}, []);

	useEffect(() => { if (puzzleKey) setPuzzleOpen(true); }, [puzzleKey]);
	useEffect(() => { if (forceShowFoundKey) setPuzzleOpen(true); }, [forceShowFoundKey]);

	const isCustomModified = !!(customStart && customEnd);
	const validationKeys = foundKeys.filter(k => k !== puzzleKey);

	const mainBtnStyle: React.CSSProperties = isStopping
		? { background: '#fc5c04', color: '#fff' }
		: isMining
			? { background: '#f0554a', color: '#fff' }
			: isCustomModified
				? { background: '#f0c040', color: '#000' }
				: { background: '#3ddc84', color: '#000' };

	return (
		<div className="space-y-6">
			<div className="volt-card">
				{/* Card Header */}
				<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
					<div>
						<div className="flex items-center gap-2">
							<Chromium className="h-5 w-5" style={{ color: '#fc5c04' }} />
							<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('browserMiner.title')}</span>
						</div>
						<p className="text-[12.5px] mt-1" style={{ color: '#5c5a55' }}>{t('browserMiner.description')}</p>
					</div>
					<button onClick={openSettings} className="volt-btn-ghost h-12 w-12 p-0 flex items-center justify-center rounded-xl" title={t('browserMiner.settings.title')}>
						<Settings className="h-7 w-7" />
					</button>
				</div>

				<div className="px-6 py-5 space-y-5">
					{/* Status + Speed Row */}
					<div className="flex items-center justify-between p-4 rounded-xl" style={{ background: '#131313', border: '1px solid #262624' }}>
						<div className="space-y-1.5">
							<p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('browserMiner.status.title')}</p>
							<div className="flex items-center gap-2">
								<span className={isMining ? 'volt-badge-success' : 'volt-badge-neutral'}>
									{isMining ? t('browserMiner.status.active') : t('browserMiner.status.idle')}
								</span>
								{isMining && (
									<span className="relative flex h-3 w-3">
										<span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#3ddc84' }} />
										<span className="relative inline-flex rounded-full h-3 w-3" style={{ background: '#3ddc84' }} />
									</span>
								)}
							</div>
							{submissionQueue.length > 0 && (
								<span className="text-[10px] font-medium px-2 py-0.5 rounded-full animate-pulse" style={{ background: 'rgba(252,92,4,0.1)', color: '#fc5c04', border: '1px solid rgba(252,92,4,0.3)' }}>
									{submissionQueue.length} {t(submissionQueue.length > 1 ? 'browserMiner.status.pendingSubmits' : 'browserMiner.status.pendingSubmit')}
								</span>
							)}
						</div>
						<div className="text-right space-y-1">
							<p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('browserMiner.status.speed')}</p>
							<p className="text-2xl font-bold font-mono" style={{ color: '#f4f3ee' }}>
								{speed.toLocaleString()} <span className="text-sm font-normal" style={{ color: '#5c5a55' }}>{t('browserMiner.status.keysPerSec')}</span>
							</p>
						</div>
					</div>

					{/* Error Banner */}
					{error && (
						<div className="p-3 rounded-xl flex items-center gap-2 text-[13px]" style={{ background: '#3a1512', border: '1px solid rgba(240,85,74,0.3)', color: '#f0554a' }}>
							<AlertCircle className="h-4 w-4 shrink-0" />
							{error}
						</div>
					)}

					{/* Progress */}
					<div className="space-y-2">
						<div className="flex justify-between text-[12.5px] font-medium" style={{ color: '#9a9892' }}>
							<span>{t('browserMiner.progress.prefix')} {activeBlockId?.slice(0, 8)}...)</span>
							<span>{progress.toFixed(1)}%</span>
						</div>
						<div className="h-3 w-full rounded-full overflow-hidden" style={{ background: '#1a1a1a' }}>
							<div
								className="h-full transition-all duration-300 ease-out relative"
								style={{ width: `${progress}%`, background: 'linear-gradient(to right, #fc5c04, #c94800)' }}
							>
								{isMining && <div className="absolute top-0 right-0 bottom-0 w-1 animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />}
							</div>
						</div>
						<div className="flex justify-between text-[11px] font-mono" style={{ color: '#5c5a55' }}>
							<span>{keysScanned.toLocaleString()} {t('browserMiner.progress.keysScanned')}</span>
							<span>{!isStopping && engineRef.current.nextBlock ? t('browserMiner.progress.nextReady') : '...'}</span>
						</div>
						{engineRef.current.currentBlock && (
							<div className="flex flex-col gap-1 text-[10px] font-mono p-2 rounded-[10px]" style={{ background: '#131313', border: '1px solid #262624', color: '#5c5a55' }}>
								<div className="flex justify-between">
									<span className="font-bold" style={{ color: '#9a9892' }}>{t('browserMiner.progress.start')}</span>
									<span className="break-all text-right">0x{bigIntToHex64(engineRef.current.currentBlock.start)}</span>
								</div>
								<div className="flex justify-between">
									<span className="font-bold" style={{ color: '#9a9892' }}>{t('browserMiner.progress.end')}</span>
									<span className="break-all text-right">0x{bigIntToHex64(engineRef.current.currentBlock.end)}</span>
								</div>
							</div>
						)}
					</div>

					{/* Key Scanner Terminal */}
					<div className="space-y-1.5">
						<label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('browserMiner.scanner.title')}</label>
						<div className="p-4 rounded-xl font-mono text-[12px] break-all min-h-20 overflow-y-auto flex flex-col justify-center relative" style={{ background: '#060606', border: '1px solid #1a1a1a', color: '#3ddc84' }}>
							{isMining ? (
								<>
									<div className="text-center text-[10px] mb-1" style={{ color: '#3d3c38' }}>{t('browserMiner.scanner.scanning')}</div>
									<div className="font-bold text-center break-all leading-tight">{currentKey}</div>
									<div className="absolute top-2 right-2">
										<div className="h-2 w-2 rounded-full animate-pulse" style={{ background: '#3ddc84' }} />
									</div>
								</>
							) : (
								<div className="italic text-center" style={{ color: '#3d3c38' }}>{statusMessage || t('browserMiner.messages.ready')}</div>
							)}
						</div>
					</div>

					{/* Action Buttons */}
					<div className="flex gap-3 pt-1">
						<button
							className="flex-1 h-12 rounded-xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2"
							style={mainBtnStyle}
							onClick={() => {
								if (isStopping) stopMining(true);
								else if (isMining) stopMining(false);
								else startMining();
							}}
						>
							{isStopping ? (
								<><Square className="h-5 w-5 animate-pulse" /> {t('browserMiner.actions.finishing')} ({t('browserMiner.actions.forceStop')})</>
							) : isMining ? (
								<><Square className="h-5 w-5" /> {t('browserMiner.actions.stop')} ({formatTime(elapsedTime)})</>
							) : (
								<><Play className="h-5 w-5" /> {t('browserMiner.actions.start')}</>
							)}
						</button>
						<button
							className="volt-btn-ghost h-12 w-12 p-0 rounded-xl flex items-center justify-center"
							onClick={() => {
								setProgress(0);
								setKeysScanned(0);
								setFoundKeys([]);
								setPuzzleKey(null);
								setCheckworkAddresses([]);
								setSpeed(0);
								setCurrentKey('0x...');
								setStatusMessage('');
								setElapsedTime(0);
								setError(null);
							}}
							title={t('browserMiner.actions.reset')}
						>
							<RefreshCw className="h-5 w-5" />
						</button>
					</div>

					{/* Results */}
					{(foundKeys.length > 0 || puzzleKey || checkworkAddresses.length > 0 || forceShowFoundKey) && (
						<div className="space-y-2 mt-2">
							{/* Puzzle Key Found */}
							{(puzzleKey || forceShowFoundKey) && (
								<div style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(240,85,74,0.08)', border: '1px solid rgba(240,85,74,0.35)' }}>
									<button
										onClick={() => setPuzzleOpen(v => !v)}
										className="w-full flex items-center justify-between p-3 text-left"
									>
										<span className="text-[13px] font-bold animate-pulse" style={{ color: '#f0554a' }}>
											🚨 {t('browserMiner.results.puzzleFound')} 🚨
										</span>
										<ChevronDown className="h-4 w-4 shrink-0" style={{ color: '#f0554a', transform: puzzleOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
									</button>
									{puzzleOpen && (
										<div className="px-3 pb-3">
											<div className="p-4 rounded-xl font-mono text-[15px] break-all select-all" style={{ background: '#1a0a08', border: '1px solid rgba(240,85,74,0.2)', color: '#f0554a' }}>
												{puzzleKey || '0000000000000000000000000000000000000000000000000000000000000001 (MOCK)'}
											</div>
										</div>
									)}
								</div>
							)}

							{/* Found Validation Keys */}
							<div style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(61,220,132,0.05)', border: '1px solid rgba(61,220,132,0.2)' }}>
								<div className="flex items-center gap-2 p-3">
									<button onClick={() => setValidationOpen(v => !v)} className="flex items-center gap-2 flex-1 text-left">
										<CheckCircle2 className="h-4 w-4" style={{ color: '#3ddc84' }} />
										<span className="text-[13px] font-medium" style={{ color: '#3ddc84' }}>
											{t('browserMiner.results.foundKeys')} ({validationKeys.length})
										</span>
										<ChevronDown className="h-4 w-4 ml-auto" style={{ color: '#5c5a55', transform: validationOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
									</button>
									{validationKeys.length > 0 && (
										<button
											type="button"
											className="p-1.5 rounded-lg shrink-0"
											style={{ background: 'rgba(61,220,132,0.1)', color: '#3ddc84' }}
											title={t('browserMiner.results.copyAll')}
											onClick={() => {
												navigator.clipboard.writeText(validationKeys.join('\n'));
												toast.success(t('browserMiner.results.copiedN').replace('{n}', String(validationKeys.length)));
											}}
										>
											<Copy className="h-4 w-4" />
										</button>
									)}
								</div>
								{validationOpen && (
									<div className="px-3 pb-3">
										<ul className="space-y-1 max-h-40 overflow-y-auto">
											{validationKeys.map((k, i) => (
												<li key={i} className="text-[11px] font-mono px-2 py-1 rounded" style={{ background: '#123420', border: '1px solid rgba(61,220,132,0.2)', color: '#3ddc84' }}>{k}</li>
											))}
										</ul>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Settings Modal */}
			{isSettingsOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
					<div className="volt-card w-full max-w-[500px] overflow-hidden volt-pop-in">
						{/* Modal Header */}
						<div className="px-6 pt-5 pb-4 flex items-center gap-3" style={{ borderBottom: '1px solid #262624' }}>
							<div className="p-2 rounded-lg" style={{ background: 'rgba(252,92,4,0.1)' }}>
								<Settings className="h-5 w-5" style={{ color: '#fc5c04' }} />
							</div>
							<div className="flex-1">
								<div className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('browserMiner.settings.modalTitle')}</div>
								<p className="text-[12px]" style={{ color: '#5c5a55' }}>{t('browserMiner.settings.modalDesc')}</p>
							</div>
							<button className="volt-btn-ghost h-12 w-12 p-0 flex items-center justify-center rounded-xl" onClick={() => setIsSettingsOpen(false)}>
								<X className="h-6 w-6" />
							</button>
						</div>

						{/* Modal Body */}
						<div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
							{/* Auto-submit Toggle */}
							<div className="p-4 rounded-xl" style={{ background: '#131313', border: '1px solid #262624' }}>
								<div className="flex items-start justify-between gap-4">
									<div className="space-y-1">
										<label className="text-[13px] font-semibold flex items-center gap-2" style={{ color: '#f4f3ee' }}>
											<Zap className="h-3.5 w-3.5" style={{ color: '#fc5c04' }} />
											{t('browserMiner.settings.autoSubmit')}
										</label>
										<p className="text-[12px]" style={{ color: '#5c5a55' }}>{t('browserMiner.settings.autoSubmitDesc')}</p>
									</div>
									<Toggle checked={draftAutoSubmit} onChange={setDraftAutoSubmit} />
								</div>
							</div>

							{/* Range Strategy */}
							<div className="space-y-3">
								<div className="flex items-center justify-between pb-2" style={{ borderBottom: '1px solid #262624' }}>
									<h4 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: '#5c5a55' }}>
										<Cpu className="h-3.5 w-3.5" />
										{t('browserMiner.settings.rangeStrategy')}
									</h4>
									{(draftCustomStart || draftCustomEnd || draftCustomTargets) && (
										<button onClick={clearCustomSettings} className="text-[12px] flex items-center gap-1" style={{ color: '#f0554a' }}>
											<RefreshCw className="h-3 w-3" /> {t('browserMiner.settings.resetToRandom')}
										</button>
									)}
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-1.5">
										<label className="text-[11.5px] font-medium" style={{ color: '#9a9892' }}>{t('browserMiner.settings.startRange')}</label>
										<div className="volt-input-wrap">
											<input
												className="w-full bg-transparent font-mono text-[11px] outline-none"
												style={{ color: '#f4f3ee' }}
												placeholder="0x000..."
												value={draftCustomStart}
												onChange={(e) => setDraftCustomStart(e.target.value)}
											/>
										</div>
									</div>
									<div className="space-y-1.5">
										<label className="text-[11.5px] font-medium" style={{ color: '#9a9892' }}>{t('browserMiner.settings.endRange')}</label>
										<div className="volt-input-wrap">
											<input
												className="w-full bg-transparent font-mono text-[11px] outline-none"
												style={{ color: '#f4f3ee' }}
												placeholder="0x0ff..."
												value={draftCustomEnd}
												onChange={(e) => setDraftCustomEnd(e.target.value)}
											/>
										</div>
									</div>
								</div>

								<div className="space-y-1.5">
									<label className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('browserMiner.settings.targetAddresses')}</label>
									<textarea
										className="w-full font-mono text-[12px] min-h-20 resize-y rounded-xl p-3 outline-none"
										style={{ background: '#131313', border: '1px solid #262624', color: '#f4f3ee' }}
										placeholder={t('browserMiner.settings.targetAddressesPlaceholder')}
										value={draftCustomTargets}
										onChange={(e) => setDraftCustomTargets(e.target.value)}
									/>
									<p className="text-[10.5px]" style={{ color: '#5c5a55' }}>{t('browserMiner.settings.targetAddressesDesc')}</p>
								</div>

								<div className="space-y-1.5">
									<label className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{t('browserMiner.settings.blockSize')}</label>
									<div className="flex gap-2">
										<div className="volt-input-wrap flex-1">
											<input
												className="w-full bg-transparent font-mono outline-none text-[13px]"
												style={{ color: '#f4f3ee' }}
												placeholder={t('browserMiner.settings.blockSizeDefault')}
												value={draftSizeInput}
												onChange={(e) => setDraftSizeInput(e.target.value)}
												type="number"
											/>
										</div>
										<select
											value={draftSizeUnit}
											onChange={(e) => setDraftSizeUnit(e.target.value)}
											className="rounded-xl px-3 text-[13px] outline-none"
											style={{ background: '#131313', border: '1px solid #262624', color: '#f4f3ee', width: 120 }}
										>
											<option value="1000">{t('browserMiner.settings.kilo')}</option>
											<option value="1000000">{t('browserMiner.settings.mega')}</option>
											<option value="1000000000">{t('browserMiner.settings.giga')}</option>
										</select>
									</div>
									<p className="text-[10.5px]" style={{ color: '#5c5a55' }}>{t('browserMiner.settings.blockSizeHint')}</p>
								</div>
							</div>
						</div>

						{/* Modal Footer */}
						<div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid #262624', background: '#0f0f0f' }}>
							<button className="volt-btn-ghost px-4" onClick={() => setIsSettingsOpen(false)}>{t('browserMiner.settings.discard')}</button>
							<button className="volt-btn-primary px-6" onClick={saveSettings}>{t('browserMiner.settings.save')}</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
