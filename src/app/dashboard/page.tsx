'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import { formatCompactHexRange, isValidBitcoinAddress } from '@/lib/formatRange';
import { Zap, Target, Clock, Bitcoin, Copy, BookOpen, Eye, EyeOff, Coins, Key, CheckCircle2, ArrowRight, XCircle, RotateCw, LogOut } from 'lucide-react';
import PuzzleInfoCard from '@/components/PuzzleInfoCard';
import PuzzleConfigNotice from '@/components/PuzzleConfigNotice';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface UserStats {
	token: string;
	bitcoinAddress: string;
	totalBlocks: number;
	completedBlocks: number;
	pendingBlocks: number;
	totalCredits: number;
	availableCredits: number;
	totalKeysValidated?: string;
	totalTimeSpentSeconds?: number;
	activeBlock: {
		id: string;
		startRange: string;
		endRange: string;
		bitcoinAddress?: string;
		checkworkAddress?: string;
		message?: string;
		assignedAt: string;
		expiresAt: string;
	} | null;
}

interface HistoryBlock {
	status: string;
	assignedAt?: string;
	completedAt?: string;
	solution?: { createdAt?: string };
	hexRangeStart?: string;
	hexRangeEnd?: string;
}

export default function UserDashboard() {
	const router = useRouter();
	const [userStats, setUserStats] = useState<UserStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [assigningBlock, setAssigningBlock] = useState(false);
	const [deletingBlock, setDeletingBlock] = useState(false);
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
	const [showFullToken, setShowFullToken] = useState(false);
	const [bitcoinAddress, setBitcoinAddress] = useState('');
	const [bitcoinAddressError, setBitcoinAddressError] = useState('');
	const [manualTokenInput, setManualTokenInput] = useState('');
	const [, setTimeRemaining] = useState<string>('');
	const [submitting, setSubmitting] = useState(false);
	const [checkworkAddresses, setCheckworkAddresses] = useState<string[]>([]);
	const [avgSpeedBKeys, setAvgSpeedBKeys] = useState<string>('0.00');
	const [avgBlockDuration, setAvgBlockDuration] = useState<string>('—');
	const [keysText, setKeysText] = useState('');
	const [blockLength, setBlockLength] = useState<string>('1T');
	const [copiedAll, setCopiedAll] = useState(false);
	const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
	const [copiedAddress, setCopiedAddress] = useState(false);
	const [copiedToken, setCopiedToken] = useState(false);
	const parsedKeys = useMemo(() => keysText
		.split(/\s|,|;|\n|\r/)
		.map(s => s.trim())
		.filter(s => s.length > 0), [keysText]);
	const validCount = useMemo(() => parsedKeys.filter(k => {
		const clean = k.startsWith('0x') ? k.slice(2) : k;
		return /^[0-9a-fA-F]{64}$/.test(clean);
	}).length, [parsedKeys]);
	const canSubmit = validCount >= 10 && parsedKeys.length >= 10;

	const formatAgo = (dateStr?: string) => {
		if (!dateStr) return 'N/A';
		const t = new Date(dateStr).getTime();
		const now = Date.now();
		const s = Math.max(0, Math.floor((now - t) / 1000));
		if (s < 60) return `${s}s ago`;
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		return `${d}d ago`;
	};

	const formatUntil = (dateStr?: string) => {
		if (!dateStr) return 'N/A';
		const t = new Date(dateStr).getTime();
		const now = Date.now();
		const diff = t - now;
		const s = Math.max(0, Math.floor(Math.abs(diff) / 1000));
		if (diff <= 0) {
			if (s < 60) return `${s}s ago`;
			const m = Math.floor(s / 60);
			if (m < 60) return `${m}m ago`;
			const h = Math.floor(m / 60);
			if (h < 24) return `${h}h ago`;
			const d = Math.floor(h / 24);
			return `${d}d ago`;
		} else {
			if (s < 60) return `in ${s}s`;
			const m = Math.floor(s / 60);
			if (m < 60) return `in ${m}m`;
			const h = Math.floor(m / 60);
			if (h < 24) return `in ${h}h`;
			const d = Math.floor(h / 24);
			return `in ${d}d`;
		}
	};

	const handleExtractHexKeys = () => {
		const matches = keysText.match(/0x[0-9a-fA-F]{64}/g) || [];
		setKeysText(matches.join('\n'));
	};

	const generateToken = async () => {
		try {
			setLoading(true);
			setError(null);

			if (!bitcoinAddress) {
				setBitcoinAddressError('Please enter a Bitcoin address');
				setLoading(false);
				return;
			}

			if (!isValidBitcoinAddress(bitcoinAddress)) {
				setBitcoinAddressError('Invalid Bitcoin address format');
				setLoading(false);
				return;
			}

			const response = await fetch('/api/token/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ bitcoinAddress }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to generate token');
			}

			const data = await response.json();
			localStorage.setItem('pool-token', data.token);
			await fetchUserStats();
			router.replace('/dashboard');
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to generate token');
			setLoading(false);
		}
	};

	const applyManualToken = async () => {
		if (!manualTokenInput.trim()) {
			setError('Please enter a valid token');
			return;
		}

		localStorage.setItem('pool-token', manualTokenInput.trim());
		setManualTokenInput('');
		await fetchUserStats();
		router.replace('/dashboard');
		router.refresh();
	};

	const logout = () => {
		localStorage.removeItem('pool-token');
		localStorage.removeItem('pool-user-stats');
		setUserStats(null);
		setError(null);
		setBitcoinAddress('');
		setManualTokenInput('');
	};

	const inFlightRef = useRef(false);
	const controllerRef = useRef<AbortController | undefined>(undefined);
	const userStatsRef = useRef<UserStats | null>(null);
	const CACHE_KEY = 'pool-user-stats';
	const fetchUserStats = useCallback(async () => {
		try {
			if (!userStatsRef.current) {
				setLoading(true);
			}
			if (inFlightRef.current) return;
			inFlightRef.current = true;
			setError(null);
			const token = localStorage.getItem('pool-token');

			if (!token) {
				setLoading(false);
				setUserStats(null);
				return;
			}

			const controller = new AbortController();
			controllerRef.current = controller;
			const response = await fetch('/api/user/stats', {
				headers: {
					'pool-token': token
				},
				cache: 'no-store',
				signal: controller.signal
			});

			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					// Token is invalid or expired, clear it and show token generation UI
					localStorage.removeItem('pool-token');
					localStorage.removeItem(CACHE_KEY);
					setUserStats(null);
					setError('Your token has expired or is invalid. Please generate a new token or enter an existing one.');
				} else {
					throw new Error('Failed to fetch user stats');
				}
				return;
			}

			const data = await response.json();

			// Garantir que os campos estejam no formato correto
			if (data.activeBlock) {
				data.activeBlock = {
					...data.activeBlock,
					startRange: data.activeBlock.startRange || data.activeBlock.hexRangeStart || '',
					endRange: data.activeBlock.endRange || data.activeBlock.hexRangeEnd || '',
				};
			}

			// Coerce numeric fields
			data.totalCredits = Number(data.totalCredits ?? 0);
			data.availableCredits = Number(data.availableCredits ?? 0);

			const prev = userStatsRef.current;
			const next = data as UserStats;
			const prevStr = prev ? JSON.stringify(prev) : '';
			const nextStr = JSON.stringify(next);
			if (prevStr !== nextStr) {
				setUserStats(next);
				userStatsRef.current = next;
				localStorage.setItem(CACHE_KEY, nextStr);
			}
			setError(null);
		} catch (err) {
			if (typeof err === 'object' && err && 'name' in err && (err as { name: string }).name === 'AbortError') {
				return;
			}
			console.error('Error fetching user stats:', err);
			setError(err instanceof Error ? err.message : 'Failed to load user statistics');
		} finally {
			inFlightRef.current = false;
			setLoading(false);
			controllerRef.current = undefined;
		}
	}, []);

	useEffect(() => {
		const token = localStorage.getItem('pool-token');
		const raw = localStorage.getItem(CACHE_KEY);
		if (token && raw) {
			try {
				const cached = JSON.parse(raw) as UserStats;
				cached.totalCredits = Number(cached.totalCredits ?? 0);
				cached.availableCredits = Number(cached.availableCredits ?? 0);
				setUserStats(cached);
				userStatsRef.current = cached;
				setLoading(false);
			} catch { }
		}
	}, []);

	const assignNewBlock = async () => {
		try {
			setAssigningBlock(true);
			const token = localStorage.getItem('pool-token');

			if (!token) {
				throw new Error('No token found. Please generate a token first.');
			}

			const response = await fetch(`/api/block?length=${encodeURIComponent(blockLength)}`, {
				method: 'GET',
				headers: {
					'pool-token': token,
					'Content-Type': 'application/json',
				}
			});

			if (!response.ok) {
				throw new Error('Failed to assign new block');
			}

			const data = await response.json();
			console.log('New block assigned:', data);
			if (Array.isArray(data.checkwork_addresses)) {
				setCheckworkAddresses(data.checkwork_addresses);
			}

			// Refresh user stats
			fetchUserStats();
		} catch (err) {
			console.error('Error assigning new block:', err);
			setError(err instanceof Error ? err.message : 'Failed to assign new block');
		} finally {
			setAssigningBlock(false);
		}
	};

	const formatRangePowerLabel = (start?: string, end?: string): string => {
		try {
			if (!start || !end) return '';
			const diffBI = BigInt(end) - BigInt(start);
			if (diffBI <= 0n) return '';
			const diffNum = Number(diffBI);
			if (!Number.isFinite(diffNum) || diffNum <= 0) {
				const expInt = (diffBI.toString(2).length - 1);
				return `2^${expInt}`;
			}
			const expDec = Math.log2(diffNum);
			return `2^${expDec.toFixed(2)}`;
		} catch {
			return '';
		}
	};

	const formatKeysCountLabel = (start?: string, end?: string): string => {
		try {
			if (!start || !end) return '';
			const lenBI = BigInt(end) - BigInt(start);
			if (lenBI <= 0n) return '';
			const lenNum = Number(lenBI);
			if (!Number.isFinite(lenNum) || lenNum <= 0) return '';
			const units = [
				{ label: 'P', value: 1e15 },
				{ label: 'T', value: 1e12 },
				{ label: 'B', value: 1e9 },
				{ label: 'M', value: 1e6 },
				{ label: 'K', value: 1e3 },
			];
			for (const u of units) {
				if (lenNum >= u.value) {
					return `≈ ${(lenNum / u.value).toFixed(2)}${u.label}`;
				}
			}
			return `≈ ${lenNum.toFixed(0)}`;
		} catch {
			return '';
		}
	};

	const formatTotalKeysLabel = (s?: string): string => {
		if (!s) return '0.00 Keys';
		try {
			const bi = BigInt(s);
			const n = Number(bi);
			let unit = 'Keys';
			let num = n;
			if (n >= 1e15) { unit = 'PKeys'; num = n / 1e15; }
			else if (n >= 1e12) { unit = 'TKeys'; num = n / 1e12; }
			else if (n >= 1e9) { unit = 'BKeys'; num = n / 1e9; }
			else if (n >= 1e6) { unit = 'MKeys'; num = n / 1e6; }
			else if (n >= 1e3) { unit = 'KKeys'; num = n / 1e3; }
			return `${num.toFixed(2)} ${unit}`;
		} catch {
			return '0.00 Keys';
		}
	};

	const formatHHMMSS = (seconds?: number): string => {
		if (!seconds || seconds <= 0) return '00:00:00';
		const hrs = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	};

	const copyAddress = async () => {
		if (userStats?.bitcoinAddress) {
			try {
				await navigator.clipboard.writeText(userStats.bitcoinAddress);
				setCopiedAddress(true);
				setTimeout(() => setCopiedAddress(false), 1500);
			} catch (err) {
				console.error('Failed to copy address:', err);
			}
		}
	};

	const copyToken = async () => {
		if (userStats?.token) {
			try {
				await navigator.clipboard.writeText(userStats.token);
				setCopiedToken(true);
				setTimeout(() => setCopiedToken(false), 1500);
			} catch (err) {
				console.error('Failed to copy token:', err);
			}
		}
	};

	const handleManualTokenSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		await applyManualToken();
	};



	const handleSubmitBlock = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!userStats?.activeBlock) {
			setError('No active block to submit');
			return;
		}

		const parsed = keysText
			.split(/\s|,|;|\n|\r/)
			.map(s => s.trim())
			.filter(s => s.length > 0);
		const limited = parsed.slice(0, 30);
		if (limited.length < 10) {
			setError('Informe pelo menos 10 private keys.');
			return;
		}
		const invalid = limited.filter(k => {
			const clean = k.startsWith('0x') ? k.slice(2) : k;
			return !/^[0-9a-fA-F]{64}$/.test(clean);
		});
		if (invalid.length > 0) {
			setError('Todas as chaves devem ter 64 caracteres hex (aceita 0x).');
			return;
		}

		try {
			setSubmitting(true);
			setError(null);

			const token = localStorage.getItem('pool-token');
			if (!token) {
				throw new Error('No token found');
			}

			const response = await fetch('/api/block/submit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'pool-token': token,
				},
				body: JSON.stringify({
					privateKeys: limited,
					blockId: userStats.activeBlock.id
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to submit block');
			}

			const data = await response.json();

			alert(`Block submitted successfully! Credits awarded: ${data.creditsAwarded}`);

			setKeysText('');
			await fetchUserStats();

		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to submit block');
		} finally {
			setSubmitting(false);
		}
	};

	const generateNewToken = async () => {
		// Se usuário está logado, gerar novo token mantendo o mesmo bitcoinAddress
		if (userStats?.bitcoinAddress) {
			try {
				setLoading(true);
				setError(null);

				const response = await fetch('/api/token/generate', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ bitcoinAddress: userStats.bitcoinAddress }),
				});

				if (!response.ok) {
					throw new Error('Failed to generate new token');
				}

				const data = await response.json();

				// Atualizar o token no localStorage
				localStorage.setItem('pool-token', data.token);

				// Atualizar o token no estado
				setUserStats(prev => prev ? { ...prev, token: data.token } : null);

				// Recarregar as estatísticas
				await fetchUserStats();
				router.replace('/dashboard');
				router.refresh();

			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to generate new token');
				setLoading(false);
			}
		} else {
			// Se não há usuário logado, usar a função original
			await generateToken();
		}
	};

	const handleLogout = () => {
		logout();
	};

	const tickRef = useRef<number | undefined>(undefined);
	useEffect(() => {
		fetchUserStats();
		const scheduleNext = () => {
			tickRef.current = window.setTimeout(() => {
				fetchUserStats();
				scheduleNext();
			}, 30000);
		};
		scheduleNext();
		const onFocus = () => { fetchUserStats(); };
		const onVisibility = () => { if (document.visibilityState === 'visible') fetchUserStats(); };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisibility);
			if (tickRef.current) clearTimeout(tickRef.current);
			if (controllerRef.current) controllerRef.current.abort();
		};
	}, [fetchUserStats]);

	// Busca os checkwork addresses do bloco ativo (caso exista)
	useEffect(() => {
		const fetchActiveBlockDetails = async () => {
			try {
				const token = localStorage.getItem('pool-token');
				if (!token || !userStats?.activeBlock?.id) {
					setCheckworkAddresses([]);
					return;
				}
				const res = await fetch('/api/block?only=true', {
					method: 'GET',
					headers: { 'pool-token': token },
					cache: 'no-store',
				});
				if (!res.ok) return;
				const data = await res.json();
				if (Array.isArray(data.checkwork_addresses)) {
					setCheckworkAddresses(data.checkwork_addresses);
				}
			} catch (err) {
				console.error('Erro ao buscar bloco ativo:', err);
			}
		};
		fetchActiveBlockDetails();
	}, [userStats?.activeBlock?.id]);

	// Calcula velocidade média (BKeys/s) e tempo médio de conclusão (últimos 10)
	useEffect(() => {
		const computeAvgSpeed = async () => {
			try {
				const token = localStorage.getItem('pool-token');
				if (!token) return;
				const res = await fetch('/api/user/history', {
					headers: { 'pool-token': token },
					cache: 'no-store',
				});
				if (!res.ok) return;
				const history = await res.json();
				const allCompleted = (history.blocks || []).filter((b: HistoryBlock) => b.status === 'COMPLETED' && b.assignedAt && (b.completedAt || b.solution?.createdAt));
				// Ordenar por data de conclusão (solution.createdAt ou completedAt) decrescente
				const sorted = allCompleted.sort((a: HistoryBlock, b: HistoryBlock) => {
					const ad = new Date(a.completedAt ?? a.solution?.createdAt ?? a.assignedAt!).getTime();
					const bd = new Date(b.completedAt ?? b.solution?.createdAt ?? b.assignedAt!).getTime();
					return bd - ad;
				});
				const completed = sorted.slice(0, 10);
				if (completed.length === 0) {
					setAvgSpeedBKeys('0.00');
					setAvgBlockDuration('—');
					return;
				}
				let totalSeconds = 0;
				let totalSizeBI = 0n;
				for (const b of completed) {
					const startMs = new Date(b.assignedAt as string).getTime();
					const endMs = new Date(b.completedAt ?? b.solution?.createdAt ?? b.assignedAt as string).getTime();
					const durSec = Math.max(1, Math.floor((endMs - startMs) / 1000));
					totalSeconds += durSec;
					if (b.hexRangeStart && b.hexRangeEnd) {
						try {
							const startBI = BigInt(b.hexRangeStart);
							const endBI = BigInt(b.hexRangeEnd);
							const sizeBI = endBI >= startBI ? (endBI - startBI + 1n) : 0n;
							totalSizeBI += sizeBI;
						} catch { }
					}
				}
				const totalSize = Number(totalSizeBI);
				const kps = totalSize / Math.max(1, totalSeconds);
				let unit = 'Keys/s';
				let num = kps;
				if (kps >= 1e15) { unit = 'PKeys/s'; num = kps / 1e15; }
				else if (kps >= 1e12) { unit = 'TKeys/s'; num = kps / 1e12; }
				else if (kps >= 1e9) { unit = 'BKeys/s'; num = kps / 1e9; }
				else if (kps >= 1e6) { unit = 'MKeys/s'; num = kps / 1e6; }
				else if (kps >= 1e3) { unit = 'KKeys/s'; num = kps / 1e3; }
				setAvgSpeedBKeys(`${num.toFixed(2)} ${unit}`);
				const avgSeconds = Math.max(1, Math.floor(totalSeconds / completed.length));
				const hours = Math.floor(avgSeconds / 3600);
				const minutes = Math.floor((avgSeconds % 3600) / 60);
				const seconds = avgSeconds % 60;
				const label = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
				setAvgBlockDuration(label);
			} catch (err) {
				console.error('Erro ao calcular velocidade média:', err);
				setAvgSpeedBKeys('0.00');
				setAvgBlockDuration('—');
			}
		};
		computeAvgSpeed();
	}, [userStats?.completedBlocks]);

	useEffect(() => {
		let interval: NodeJS.Timeout | undefined;
		const expiresAt = userStats?.activeBlock?.expiresAt;
		if (expiresAt) {
			const updateRel = () => setTimeRemaining(formatUntil(expiresAt));
			updateRel();
			interval = setInterval(updateRel, 30000);
		} else {
			setTimeRemaining('');
		}
		return () => { if (interval) clearInterval(interval); };
	}, [userStats?.activeBlock?.expiresAt]);

	const [puzzleMeta, setPuzzleMeta] = useState<{ address?: string | null; puzzleStart?: string; puzzleEnd?: string; startExp?: number; endExp?: number; maxExp?: number } | null>(null);
	const [puzzleLoading, setPuzzleLoading] = useState(true);
	const [noPuzzle, setNoPuzzle] = useState(false);
	useEffect(() => {
		const fetchPuzzleMeta = async () => {
			try {
				setPuzzleLoading(true);
				const res = await fetch('/api/pool/overview');
				if (res.status === 404) { setNoPuzzle(true); setPuzzleMeta(null); return; }
				if (!res.ok) return;
				const data = await res.json();
				const m = data.meta || {};
				const bitLen = (hex?: string) => {
					if (!hex) return undefined;
					try { const bi = BigInt(hex); return bi.toString(2).length; } catch { return undefined; }
				};
				setPuzzleMeta({
					address: m.address ?? null,
					puzzleStart: m.puzzleStart,
					puzzleEnd: m.puzzleEnd,
					startExp: typeof bitLen(m.puzzleStart) === 'number' ? (bitLen(m.puzzleStart)! - 1) : undefined,
					endExp: typeof m.maxExp === 'number' ? m.maxExp : bitLen(m.puzzleEnd),
					maxExp: typeof m.maxExp === 'number' ? m.maxExp : undefined,
				});
			} catch { }
			finally { setPuzzleLoading(false); }
		};
		fetchPuzzleMeta();
	}, []);

	if (loading) {
		return (
			<div className="min-h-screen bg-white text-black">
				<div className="flex items-center justify-center py-20">
					<div className="text-center">
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
						<p className="text-gray-600">Loading dashboard...</p>
					</div>
				</div>
			</div>
		);
	}

	if (noPuzzle) {
		return (
			<div className="min-h-screen bg-white text-black">
				<div className="max-w-4xl mx-auto px-4 py-8">
					<PuzzleConfigNotice />
				</div>
			</div>
		);
	}

	if (!userStats || error?.includes('token') || error?.includes('Token')) {
		return (
			<div className="min-h-screen bg-white text-black">
				<div className="max-w-4xl mx-auto px-4 py-8">
					<div className="text-center mb-8">
						<h1 className="text-3xl font-bold mb-4 text-black">User Dashboard</h1>
						<p className="text-gray-600">
							{error?.includes('token') || error?.includes('Token')
								? error
								: 'You need a token to access the dashboard'
							}
						</p>
					</div>

					<div className="grid md:grid-cols-2 gap-8">
						{/* Inserir Token Manual */}
						<Card className="bg-white border-gray-200 shadow-sm">
							<CardHeader>
								<CardTitle className="text-black">Enter Token</CardTitle>
								<CardDescription className="text-gray-600">
									Paste your existing token here
								</CardDescription>
							</CardHeader>
							<CardContent>
								<form onSubmit={handleManualTokenSubmit} className="space-y-4">
									<input
										type="text"
										value={manualTokenInput}
										onChange={(e) => setManualTokenInput(e.target.value)}
										placeholder="Paste your token here..."
										className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
									/>
									<Button
										type="submit"
										className="w-full bg-blue-500 hover:bg-blue-600 text-white"
										disabled={!manualTokenInput.trim()}
									>
										Load Dashboard
									</Button>
								</form>
							</CardContent>
						</Card>

						{/* Gerar Novo Token */}
						<Card className="bg-white border-gray-200 shadow-sm">
							<CardHeader>
								<CardTitle className="text-black">New Token</CardTitle>
								<CardDescription className="text-gray-600">
									Enter your Bitcoin address and generate a new token
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									<input
										type="text"
										value={bitcoinAddress}
										onChange={(e) => setBitcoinAddress(e.target.value)}
										placeholder="Enter your Bitcoin address..."
										className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
									/>
									{bitcoinAddressError && (
										<p className="text-red-500 text-sm">{bitcoinAddressError}</p>
									)}
									<Button
										onClick={generateNewToken}
										className="w-full bg-blue-500 hover:bg-blue-600 text-white"
										disabled={loading}
									>
										{loading ? 'Generating...' : 'Generate New Token'}
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Informações do Puzzle */}
					<Card className="bg-white border-gray-200 shadow-sm mt-8">
						<CardHeader>
							<CardTitle className="text-black flex items-center gap-2">
								<Bitcoin className="h-5 w-5 text-blue-500" />
								Puzzle Data Information
							</CardTitle>
							<CardDescription className="text-gray-600">
								Current Bitcoin puzzle configuration
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid md:grid-cols-1 gap-4">
								<div>
									<label className="text-gray-700 text-sm font-medium">Bitcoin Address</label>
									<div className="text-gray-800 font-mono text-sm break-all bg-gray-50 p-3 rounded-lg border border-gray-200 mt-1">
										{puzzleMeta?.address || 'Not configured'}
									</div>
								</div>

								<div>
									<label className="text-gray-700 text-sm font-medium">Key Range (Bits)</label>
									<div className="text-gray-800 font-mono text-sm break-all bg-gray-50 p-3 rounded-lg border border-gray-200 mt-1">
										{(puzzleMeta?.startExp !== undefined && puzzleMeta?.endExp !== undefined) ? `2^${puzzleMeta.startExp}…2^${puzzleMeta.endExp}` : 'Not available'}
									</div>
								</div>

								{userStats?.activeBlock && (
									<div className="flex items-center justify-between">
										<div className="text-sm text-gray-700">
											<span className="font-mono text-gray-800">{userStats.activeBlock.startRange}</span>
											<span className="mx-1 text-gray-400">→</span>
											<span className="font-mono text-gray-800">{userStats.activeBlock.endRange}</span>
										</div>
										<div className="px-2 py-1 rounded bg-white border text-xs text-gray-700">
											{formatRangePowerLabel(userStats?.activeBlock?.startRange, userStats?.activeBlock?.endRange)} • {formatKeysCountLabel(userStats?.activeBlock?.startRange, userStats?.activeBlock?.endRange)}
										</div>
									</div>
								)}
								<div>
									<label className="text-gray-700 text-sm font-medium">Start Range</label>
									<div className="text-gray-800 font-mono text-sm break-all bg-gray-50 p-3 rounded-lg border border-gray-200 mt-1">
										{formatCompactHexRange(puzzleMeta?.puzzleStart || '0')}
									</div>
								</div>
								<div>
									<label className="text-gray-700 text-sm font-medium">End Range</label>
									<div className="text-gray-800 font-mono text-sm break-all bg-gray-50 p-3 rounded-lg border border-gray-200 mt-1">
										{formatCompactHexRange(puzzleMeta?.puzzleEnd || '0')}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className="mt-6">
						{puzzleLoading ? (
							<div className="bg-white border border-gray-200 rounded-md p-4 animate-pulse">
								<div className="h-6 w-40 bg-gray-200 rounded mb-2" />
								<div className="h-4 w-64 bg-gray-200 rounded" />
							</div>
						) : (
							<PuzzleInfoCard variant="dashboard" />
						)}
					</div>
				</div>
			</div>
		);
	}

	if (error && !error.includes('No token found')) {
		return (
			<div className="min-h-screen bg-white text-black">
				<div className="flex items-center justify-center py-20">
					<div className="max-w-md mx-auto">
						<Card className="bg-white border-gray-200 shadow-sm">
							<CardHeader>
								<CardTitle className="text-black">Token Issue</CardTitle>
								<CardDescription className="text-gray-600">{error}</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex gap-3">
									<Button onClick={fetchUserStats} className="bg-blue-500 hover:bg-blue-600 text-white">Try Again</Button>
									<Button onClick={handleLogout} variant="destructive" className="bg-red-500 hover:bg-red-600 text-white">Clear Data</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		);
	}

	if (!userStats) {
		return (
			<div className="min-h-screen bg-white text-black">
				<div className="flex items-center justify-center py-20">
					<div className="text-center">
						<p className="text-gray-600">No data available</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		// PADRÃO 1: Fundo com degrad
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 text-gray-900">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

				{/* User Info & Actions (Seção de Perfil/Token) */}
				<Card className="mb-8 shadow-md border-gray-200">
					<CardHeader className="border-b pb-4">
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
							<div className="flex items-center gap-3">
								<div className="p-3 bg-blue-100 rounded-full">
									<Key className="h-6 w-6 text-blue-600" />
								</div>
								<div>
									<CardTitle className="text-2xl font-bold text-gray-900">Pool User Session</CardTitle>
									<CardDescription className="text-gray-600">Your unique identifier and associated Bitcoin address.</CardDescription>
								</div>
							</div>
							<div className="flex gap-3">
								<Button
									onClick={generateNewToken}
									className="bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-2"
									disabled={loading}
								>
									<RotateCw className='h-4 w-4' /> Rotate Token
								</Button>
								<Button
									onClick={handleLogout}
									className="bg-red-600 hover:bg-red-700 text-white font-semibold inline-flex items-center gap-2"
								>
									<LogOut className='h-4 w-4' /> Log Out
								</Button>
							</div>
						</div>
					</CardHeader>
					<CardContent className='pt-6'>
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
							{/* Linha do Bitcoin Address */}
							<div className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-lg">
								<Bitcoin className="h-5 w-5 text-green-600 mr-3 shrink-0" />
								<div className='1 min-w-0'>
									<p className="text-xs text-gray-600 font-medium">Bitcoin Address (Payout)</p>
									<span className="text-sm font-mono text-gray-800 break-all">{userStats.bitcoinAddress || 'N/A'}</span>
								</div>
								<button type="button" className="ml-2 bg-transparent hover:bg-gray-200 p-2 rounded-full" onClick={copyAddress}>
									{copiedAddress ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-600" />}
								</button>
							</div>

							{/* Linha do Token */}
							<div className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-lg">
								<Key className="h-5 w-5 text-blue-600 mr-3 shrink-0" />
								<div className='flex-1 min-w-0'>
									<p className="text-xs text-gray-600 font-medium">Pool Token</p>
									<span className="text-sm font-mono text-gray-800 break-all">
										{showFullToken ? userStats.token : `${userStats.token.substring(0, 10)}...`}
									</span>
								</div>
								<div className='flex ml-2'>
									<button type="button" className="bg-transparent hover:bg-gray-200 p-2 rounded-full" onClick={() => setShowFullToken(!showFullToken)}>
										{showFullToken ? <EyeOff className="h-4 w-4 text-gray-600" /> : <Eye className="h-4 w-4 text-gray-600" />}
									</button>
									<button type="button" className="bg-transparent hover:bg-gray-200 p-2 rounded-full" onClick={copyToken}>
										{copiedToken ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-600" />}
									</button>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Stats Overview */}
				<h2 className="text-2xl font-bold text-gray-900 mb-4">Statistics Summary</h2>
				{/* Grid ajustado para 6 colunas no LG para exibir todas as métricas */}
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">

					{/* Total Blocks */}
					<Card className="shadow-sm border-gray-200">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-gray-600">Total Blocks</CardTitle>
							<Target className="h-4 w-4 text-blue-500" />
						</CardHeader>
						<CardContent>
							<div className="text-xl font-bold text-gray-900">{formatNumber(userStats.totalBlocks)}</div>
							<p className="text-xs text-gray-600">{userStats.completedBlocks} completed</p>
						</CardContent>
					</Card>

					{/* Total Credits */}
					<Card className="shadow-sm border-gray-200">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-gray-600">Total Credits</CardTitle>
							<Coins className="h-4 w-4 text-blue-500" />
						</CardHeader>
						<CardContent>
							<div className="text-xl font-bold text-gray-900">{userStats.totalCredits.toFixed(3)}</div>
							<p className="text-xs text-gray-600">{userStats.availableCredits.toFixed(3)} available</p>
						</CardContent>
					</Card>

					{/* Pending Blocks */}
					<Card className="shadow-sm border-gray-200">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-gray-600">Pending Blocks</CardTitle>
							<Clock className="h-4 w-4 text-blue-500" />
						</CardHeader>
						<CardContent>
							<div className="text-xl font-bold text-gray-900">{userStats.pendingBlocks}</div>
							<p className="text-xs text-gray-600">Awaiting completion</p>
						</CardContent>
					</Card>

					{/* Completion Rate */}
					<Card className="shadow-sm border-gray-200">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-gray-600">Completion Rate</CardTitle>
							<Zap className="h-4 w-4 text-blue-500" />
						</CardHeader>
						<CardContent>
							<div className="text-xl font-bold text-gray-900">
								{userStats && userStats.totalBlocks > 0
									? Math.round((userStats.completedBlocks / userStats.totalBlocks) * 100)
									: 0}%
							</div>
							<p className="text-xs text-gray-600">Success percentage</p>
						</CardContent>
					</Card>

					{/* Average Speed */}
					<Card className="shadow-sm border-gray-200">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-gray-600">Average Speed</CardTitle>
							<Zap className="h-4 w-4 text-blue-600" />
						</CardHeader>
						<CardContent>
							<div className="text-xl font-bold text-gray-900">{avgSpeedBKeys}</div>
							<p className="text-xs text-gray-600">Avg duration: {avgBlockDuration}</p>
						</CardContent>
					</Card>

					{/* Total Validated */}
					<Card className="shadow-sm border-gray-200">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-gray-600">Total Validated</CardTitle>
							<CheckCircle2 className="h-4 w-4 text-green-600" />
						</CardHeader>
						<CardContent>
							<div className="text-xl font-bold text-gray-900">{formatTotalKeysLabel(userStats.totalKeysValidated)}</div>
							<p className="text-xs text-gray-600">Total time: {formatHHMMSS(userStats.totalTimeSpentSeconds)}</p>
						</CardContent>
					</Card>
				</div>

				{/* Active Block & Submission */}
				{/* Grid 2/3 (Detalhes do Bloco) + 1/3 (Submissão) */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

					{/* Coluna 1: Active Block Details & Request (2/3) */}
					<div className='lg:col-span-2'>
						<Card className="shadow-md border-gray-200 h-full">
							<CardHeader className='border-b pb-4'>
								<div className="flex items-center justify-between">
									<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
										<Bitcoin className="h-5 w-5 text-blue-600" />
										Active Work Block
									</CardTitle>
									{userStats.activeBlock ? (
										<Button
											type="button"
											variant='outline'
											className="inline-flex items-center gap-2 bg-white text-red-600 border-red-400 hover:bg-red-50 hover:text-red-700"
											onClick={() => setConfirmDeleteOpen(true)}
											disabled={deletingBlock}
										>
											<LogOut className='w-4 h-4' /> {deletingBlock ? 'Deleting...' : 'Delete Active Block'}
										</Button>
									) : null}
								</div>
								<CardDescription className='text-gray-600'>
									{userStats.activeBlock ? 'Your current assigned key range and expiration time.' : 'No active block at the moment. Assign one below.'}
								</CardDescription>
							</CardHeader>
							<CardContent className='pt-6'>
								{userStats.activeBlock ? (
									<div className="space-y-4">
										{/* Range e Contagem */}
										<div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
											<div className="flex items-center justify-between text-gray-700 text-sm">
												<div className='flex items-center'>
													<span className="font-mono text-gray-800 break-all pr-2">{formatCompactHexRange(userStats.activeBlock.startRange)}</span>
													<ArrowRight className='w-4 h-4 text-blue-600' />
													<span className="font-mono text-gray-800 break-all pl-2">{formatCompactHexRange(userStats.activeBlock.endRange)}</span>
												</div>
												<div className="px-3 py-1 rounded bg-white border text-xs font-semibold text-blue-600">
													{formatRangePowerLabel(userStats?.activeBlock?.startRange, userStats?.activeBlock?.endRange)}
												</div>
											</div>
											<p className='text-xs text-green-600 mt-2'>{formatKeysCountLabel(userStats?.activeBlock?.startRange, userStats?.activeBlock?.endRange)} keys in range</p>
										</div>

										<div className="flex items-center justify-between text-xs">
											<div className="flex items-center gap-2">
												<span className="text-gray-600 font-medium">Assigned</span>
												<span className="font-semibold text-gray-800">{new Date(userStats.activeBlock.assignedAt).toLocaleString()}</span>
												<Badge className="bg-gray-100 text-gray-800 border border-gray-300">
													{formatAgo(userStats.activeBlock.assignedAt)}
												</Badge>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-gray-600 font-medium">Expires</span>
												{userStats.activeBlock.expiresAt && (
													<>
														<span className="font-semibold text-gray-800">{new Date(userStats.activeBlock.expiresAt).toLocaleString()}</span>
														<Badge
															className={new Date(userStats.activeBlock.expiresAt).getTime() <= Date.now() ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-blue-100 text-blue-800 border border-blue-300'}
														>
															{new Date(userStats.activeBlock.expiresAt).getTime() <= Date.now() ? formatAgo(userStats.activeBlock.expiresAt) : formatUntil(userStats.activeBlock.expiresAt)}
														</Badge>
													</>
												)}
											</div>
										</div>

										{/* Endereços de Checkwork */}
										<div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
											<h4 className="text-gray-800 font-semibold mb-3">Checkwork Addresses ({checkworkAddresses.length})</h4>
											<div className="space-y-2 max-h-40 overflow-y-auto pr-2">
												{checkworkAddresses.length > 0 ? (
													checkworkAddresses.map((addr, idx) => (
														<div key={idx} className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-1.5">
															<code className="text-gray-800 text-xs break-all font-mono">{addr}</code>
															<button
																type="button"
																onClick={async () => {
																	await navigator.clipboard.writeText(addr);
																	setCopiedIdx(idx);
																	setTimeout(() => setCopiedIdx(null), 1500);
																}}
																className="text-gray-600 hover:text-blue-600 text-xs inline-flex items-center gap-1 ml-2 shrink-0"
															>
																{copiedIdx === idx ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
															</button>
														</div>
													))
												) : (
													<p className="text-gray-600 text-sm">Loading checkwork addresses...</p>
												)}
											</div>
											<Button
												type="button"
												variant='outline'
												className="mt-3 w-full inline-flex items-center justify-center gap-2 text-blue-600 border-blue-400 hover:bg-blue-50"
												onClick={async () => {
													await navigator.clipboard.writeText(checkworkAddresses.join('\n'));
													setCopiedAll(true);
													setTimeout(() => setCopiedAll(false), 1500);
												}}
											>
												{copiedAll ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
												<span>{copiedAll ? 'Copied All Addresses!' : 'Copy All Addresses'}</span>
											</Button>
										</div>
									</div>
								) : (
									// Estado: Sem Bloco Ativo (Ação de Atribuir Bloco)
									<div className="text-center py-8 bg-gray-50 border border-gray-200 rounded-lg">
										<Bitcoin className="w-10 h-10 text-gray-500 mx-auto mb-4" />
										<p className="text-gray-700 mb-4">You don’t have any active block at the moment. Request a new one.</p>
										<div className="flex items-center justify-center gap-3 mb-4">
											<label className="text-sm text-gray-600">Block length</label>
											<select value={blockLength} onChange={(e) => setBlockLength(e.target.value)} className="px-3 py-2 border border-gray-300 rounded text-sm bg-white">
												<option value="1T">1T</option>
												<option value="10T">10T</option>
												<option value="10B">10B</option>
												<option value="100T">100T</option>
											</select>
										</div>
										<Button
											onClick={assignNewBlock}
											disabled={assigningBlock || puzzleLoading}
											className="bg-green-600 text-white hover:bg-green-700 font-semibold"
										>
											{assigningBlock ? 'Assigning...' : 'Assign New Block'}
										</Button>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Coluna 2: Private Key Submission (1/3) */}
					<div className='lg:col-span-1'>
						<Card className="shadow-md border-gray-200 h-full">
							<CardHeader className='border-b pb-4'>
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
									<Key className="h-5 w-5 text-purple-600" />
									Solution Submission
								</CardTitle>
								<CardDescription className='text-gray-600'>Paste and submit your found private keys.</CardDescription>
							</CardHeader>
							<CardContent className='pt-6'>
								<form onSubmit={handleSubmitBlock} className="space-y-4 h-full">
									<div className="space-y-3 h-full flex flex-col">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												{/* Status de Validação */}
												<span className={`px-2 py-1 rounded border text-xs font-semibold ${validCount >= 10 ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'}`}>
													Valid: {validCount} / 10
												</span>
												<span className="px-2 py-1 rounded bg-gray-100 border text-xs text-gray-700">Parsed: {parsedKeys.length}</span>
											</div>
											<button type="button" className="px-3 py-1 rounded-lg text-sm font-medium transition-colors bg-gray-200 hover:bg-gray-300 text-gray-800" onClick={async () => { try { const t = await navigator.clipboard.readText(); setKeysText(t); } catch { } }}>Paste</button>
										</div>

										<label className="block text-xs text-gray-600">Private Keys (10 required, hex format)</label>
										<textarea
											value={keysText}
											onChange={(e) => setKeysText(e.target.value)}
											className="w-full flex-1 h-full min-h-[250px] px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
											placeholder="Paste one key per line, or separated by spaces/commas."
											disabled={!userStats.activeBlock}
										/>

										<div className="flex flex-wrap gap-3 pt-2">
											<Button
												type="submit"
												disabled={submitting || !canSubmit || !userStats.activeBlock}
												className="bg-purple-600 text-white hover:bg-purple-700 font-semibold inline-flex items-center gap-2"
											>
												{submitting ? 'Submitting...' : 'Submit Keys'}
											</Button>
											<Button type="button" onClick={handleExtractHexKeys} variant='outline' className="text-gray-700 hover:bg-gray-200">Extract 0x Keys</Button>
											<Button type="button" onClick={() => { setKeysText(''); }} variant='outline' className="text-red-600 border-red-400 hover:bg-red-50">Clear All</Button>
										</div>
										{error && !error.includes('token') && (
											<p className='text-red-600 text-sm pt-2 inline-flex items-center gap-1'><XCircle className='w-4 h-4' /> {error}</p>
										)}
									</div>
								</form>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Quick Actions & Docs */}
				<div className="max-w-7xl mx-auto">
					<h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Links</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

						{/* Puzzle Configuration */}
						<Card className="shadow-sm border-gray-200">
							<CardHeader className='pb-3'>
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
									<Bitcoin className="h-5 w-5 text-blue-600" />
									Puzzle Configuration
								</CardTitle>
								<CardDescription className='text-gray-600'>Current target address and key range.</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='flex justify-between items-center'>
									<p className='text-sm text-gray-700'>{puzzleMeta?.address ? 'Configured' : 'Not Configured'}</p>
									<div className='px-3 py-1 rounded bg-gray-200 text-xs font-semibold text-gray-800'>
										{puzzleMeta?.startExp && puzzleMeta?.endExp ? `2^${puzzleMeta.startExp}…2^${puzzleMeta.endExp}` : 'N/A'}
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Block History */}
						<Card className="shadow-sm border-gray-200">
							<CardHeader className='pb-3'>
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
									<Target className="h-5 w-5 text-blue-600" />
									Block History
								</CardTitle>
								<CardDescription className='text-gray-600'>Visualize your past work blocks and results.</CardDescription>
							</CardHeader>
							<CardContent>
								<Link
									href="/history"
									className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all duration-200 font-semibold"
								>
									<span>View History</span>
									<ArrowRight className="w-4 h-4" />
								</Link>
							</CardContent>
						</Card>

						{/* Documentation */}
						<Card className="shadow-sm border-gray-200">
							<CardHeader className='pb-3'>
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
									<BookOpen className="h-5 w-5 text-blue-600" />
									Documentation
								</CardTitle>
								<CardDescription className='text-gray-600'>Learn how to use the system and GPU tools efficiently.</CardDescription>
							</CardHeader>
							<CardContent>
								<Link
									href="/docs/api"
									className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all duration-200 font-semibold"
								>
									<span>View Docs</span>
									<ArrowRight className="w-4 h-4" />
								</Link>
							</CardContent>
						</Card>
					</div>
				</div>
			</div >

			{userStats.activeBlock ? (
				<Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete Active Block</DialogTitle>
							<DialogDescription>
								This will expire your current assignment and free you to request a new block. Proceed?
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
							<Button
								variant="destructive"
								disabled={deletingBlock}
								onClick={async () => {
									try {
										setDeletingBlock(true);
										setError(null);
										const token = localStorage.getItem('pool-token');
										if (!token) {
											throw new Error('No token found');
										}
										const r = await fetch('/api/block', { method: 'DELETE', headers: { 'pool-token': token } });
										if (!r.ok) {
											let msg = 'Failed to delete active block';
											try { const d = await r.json(); if (d?.error) msg = d.error; } catch { }
											throw new Error(msg);
										}
										setKeysText('');
										setCheckworkAddresses([]);
										await fetchUserStats();
										setConfirmDeleteOpen(false);
									} catch (err) {
										setError(err instanceof Error ? err.message : 'Failed to delete active block');
										setConfirmDeleteOpen(false);
									} finally {
										setDeletingBlock(false);
									}
								}}
							>
								Delete
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			) : null}

		</div>
	)
}
