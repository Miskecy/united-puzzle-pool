'use client';
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { formatNumber } from '@/lib/utils';
import { formatCompactHexRange, isValidBitcoinAddress } from '@/lib/formatRange';
import {
	Zap, Target, Clock, Bitcoin, Copy, BookOpen, Eye, EyeOff,
	Coins, Key, CheckCircle2, ArrowRight, XCircle, RotateCw,
	LogOut, Award, Cpu, Monitor,
} from 'lucide-react';
import PuzzleInfoCard from '@/components/PuzzleInfoCard';
import PuzzleConfigNotice from '@/components/PuzzleConfigNotice';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BrowserMiner from '@/components/BrowserMiner';
import { toast } from 'sonner';

/* ── Types ─────────────────────────────────────────────────────────── */
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

interface DistInfo {
	balanceBtc: number;
	poolShareBtc: number;
	totalAvailableCredits: number;
	userAvailableCredits: number;
	userSharePercent: number;
	expectedRewardBtc: number;
}

interface HistoryBlock {
	status: string;
	assignedAt?: string;
	completedAt?: string;
	solution?: { createdAt?: string };
	hexRangeStart?: string;
	hexRangeEnd?: string;
}

/* ── Helpers ────────────────────────────────────────────────────────── */
type TFn = (key: string) => string

function formatAgo(dateStr: string | undefined, t: TFn): string {
	if (!dateStr) return 'N/A';
	const s = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
	if (s < 60) return t('common.timeAgo.s').replace('{n}', `${s}`);
	const m = Math.floor(s / 60);
	if (m < 60) return t('common.timeAgo.min').replace('{n}', `${m}`);
	const h = Math.floor(m / 60);
	if (h < 24) return t('common.timeAgo.h').replace('{n}', `${h}`);
	return t('common.timeAgo.d').replace('{n}', `${Math.floor(h / 24)}`);
}

function formatUntil(dateStr: string | undefined, t: TFn): string {
	if (!dateStr) return 'N/A';
	const diff = new Date(dateStr).getTime() - Date.now();
	const s = Math.max(0, Math.floor(Math.abs(diff) / 1000));
	if (diff <= 0) return formatAgo(dateStr, t);
	if (s < 60) return t('common.timeIn.s').replace('{n}', `${s}`);
	const m = Math.floor(s / 60);
	if (m < 60) return t('common.timeIn.m').replace('{n}', `${m}`);
	const h = Math.floor(m / 60);
	if (h < 24) return t('common.timeIn.h').replace('{n}', `${h}`);
	return t('common.timeIn.d').replace('{n}', `${Math.floor(h / 24)}`);
}

function formatLastUpdated(ts: number | null, t: TFn): string {
	if (!ts) return '—';
	return formatAgo(new Date(ts).toISOString(), t);
}

function formatRangePowerLabel(start?: string, end?: string): string {
	try {
		if (!start || !end) return '';
		const diffBI = BigInt(end) - BigInt(start);
		if (diffBI <= 0n) return '';
		const diffNum = Number(diffBI);
		if (!Number.isFinite(diffNum) || diffNum <= 0) return `2^${diffBI.toString(2).length - 1}`;
		return `2^${Math.log2(diffNum).toFixed(2)}`;
	} catch { return ''; }
}

function formatKeysCountLabel(start?: string, end?: string): string {
	try {
		if (!start || !end) return '';
		const len = Number(BigInt(end) - BigInt(start));
		if (!Number.isFinite(len) || len <= 0) return '';
		const units = [{ l: 'P', v: 1e15 }, { l: 'T', v: 1e12 }, { l: 'B', v: 1e9 }, { l: 'M', v: 1e6 }, { l: 'K', v: 1e3 }];
		for (const u of units) if (len >= u.v) return `≈ ${(len / u.v).toFixed(2)}${u.l}`;
		return `≈ ${len.toFixed(0)}`;
	} catch { return ''; }
}

function formatTotalKeysLabel(s?: string): string {
	if (!s) return '0.00 Keys';
	try {
		const n = Number(BigInt(s));
		let unit = 'Keys', num = n;
		if (n >= 1e15) { unit = 'PKeys'; num = n / 1e15; }
		else if (n >= 1e12) { unit = 'TKeys'; num = n / 1e12; }
		else if (n >= 1e9) { unit = 'BKeys'; num = n / 1e9; }
		else if (n >= 1e6) { unit = 'MKeys'; num = n / 1e6; }
		else if (n >= 1e3) { unit = 'KKeys'; num = n / 1e3; }
		return `${num.toFixed(2)} ${unit}`;
	} catch { return '0.00 Keys'; }
}

function formatHHMMSS(seconds?: number): string {
	if (!seconds || seconds <= 0) return '00:00:00';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/* ── Component ──────────────────────────────────────────────────────── */
export default function UserDashboard() {
	const { t } = useTranslation()
	const tRef = useRef(t)
	useEffect(() => { tRef.current = t }, [t])
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
	const [lastUpdated, setLastUpdated] = useState<number | null>(null);
	const [poolDist, setPoolDist] = useState<DistInfo | null>(null);
	const [usdPrice, setUsdPrice] = useState<number | null>(null);
	const [puzzleMeta, setPuzzleMeta] = useState<{
		address?: string | null;
		puzzleStart?: string;
		puzzleEnd?: string;
		startExp?: number;
		endExp?: number;
	} | null>(null);
	const [puzzleLoading, setPuzzleLoading] = useState(true);
	const [noPuzzle, setNoPuzzle] = useState(false);

	const parsedKeys = useMemo(() =>
		keysText.split(/[\s,;\n\r]+/).map(s => s.trim()).filter(Boolean),
		[keysText]
	);
	const validCount = useMemo(() => parsedKeys.filter(k => {
		const clean = k.startsWith('0x') ? k.slice(2) : k;
		return /^[0-9a-fA-F]{64}$/.test(clean);
	}).length, [parsedKeys]);
	const canSubmit = validCount >= 10 && parsedKeys.length >= 10;

	/* ── Fetch user stats ─────────────────────────────────────────── */
	const inFlightRef = useRef(false);
	const controllerRef = useRef<AbortController | undefined>(undefined);
	const userStatsRef = useRef<UserStats | null>(null);
	const CACHE_KEY = 'pool-user-stats';

	const fetchUserStats = useCallback(async () => {
		if (inFlightRef.current) return;
		inFlightRef.current = true;
		if (!userStatsRef.current) setLoading(true);
		setError(null);
		try {
			const token = localStorage.getItem('pool-token');
			if (!token) { setLoading(false); setUserStats(null); return; }

			const controller = new AbortController();
			controllerRef.current = controller;
			const response = await fetch('/api/user/stats', {
				headers: { 'pool-token': token },
				cache: 'no-store',
				signal: controller.signal,
			});

			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					localStorage.removeItem('pool-token');
					localStorage.removeItem(CACHE_KEY);
					setUserStats(null);
					setError(tRef.current('dashboard.auth.expired'));
				} else {
					throw new Error('Failed to fetch user stats');
				}
				return;
			}

			const data = await response.json();
			if (data.activeBlock) {
				data.activeBlock = {
					...data.activeBlock,
					startRange: data.activeBlock.startRange || data.activeBlock.hexRangeStart || '',
					endRange: data.activeBlock.endRange || data.activeBlock.hexRangeEnd || '',
				};
			}
			data.totalCredits = Number(data.totalCredits ?? 0);
			data.availableCredits = Number(data.availableCredits ?? 0);

			const nextStr = JSON.stringify(data);
			if (JSON.stringify(userStatsRef.current) !== nextStr) {
				setUserStats(data);
				userStatsRef.current = data;
				localStorage.setItem(CACHE_KEY, nextStr);
			}
			setLastUpdated(Date.now());
		} catch (err) {
			if (typeof err === 'object' && err && 'name' in err && (err as { name: string }).name === 'AbortError') return;
			setError(err instanceof Error ? err.message : 'Failed to load user statistics');
		} finally {
			inFlightRef.current = false;
			setLoading(false);
			controllerRef.current = undefined;
		}
	}, []);

	/* ── Bootstrap: load cache, then fetch fresh ─────────────────── */
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
		fetchUserStats();
	}, [fetchUserStats]);

	/* ── Poll every 30 s ──────────────────────────────────────────── */
	useEffect(() => {
		const tickRef = { current: undefined as ReturnType<typeof setTimeout> | undefined };
		const schedule = () => {
			tickRef.current = setTimeout(() => { fetchUserStats(); schedule(); }, 30000);
		};
		schedule();
		const onFocus = () => fetchUserStats();
		const onVisibility = () => { if (document.visibilityState === 'visible') fetchUserStats(); };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			clearTimeout(tickRef.current);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisibility);
			controllerRef.current?.abort();
		};
	}, [fetchUserStats]);

	/* ── Pool distribution ────────────────────────────────────────── */
	useEffect(() => {
		(async () => {
			try {
				const token = localStorage.getItem('pool-token');
				if (!token) return;
				const r = await fetch('/api/pool/distribution', { headers: { 'pool-token': token } });
				if (!r.ok) return;
				setPoolDist(await r.json());
			} catch { }
		})();
	}, []);

	/* ── BTC price ────────────────────────────────────────────────── */
	useEffect(() => {
		(async () => {
			try {
				const info = await fetch('/api/puzzle/info', { cache: 'no-store' });
				if (!info.ok) return;
				const j = await info.json();
				const btc = Number(j?.balanceBtc || 0);
				const usd = Number(j?.balanceUsd || 0);
				if (btc > 0 && usd > 0) setUsdPrice(usd / btc);
			} catch { }
		})();
	}, []);

	/* ── Puzzle metadata ──────────────────────────────────────────── */
	useEffect(() => {
		(async () => {
			try {
				setPuzzleLoading(true);
				const res = await fetch('/api/pool/overview');
				if (res.status === 404) { setNoPuzzle(true); setPuzzleMeta(null); return; }
				if (!res.ok) return;
				const data = await res.json();
				const m = data.meta || {};
				const bitLen = (hex?: string) => { try { return hex ? BigInt(hex).toString(2).length : undefined; } catch { return undefined; } };
				setPuzzleMeta({
					address: m.address ?? null,
					puzzleStart: m.puzzleStart,
					puzzleEnd: m.puzzleEnd,
					startExp: bitLen(m.puzzleStart) ? bitLen(m.puzzleStart)! - 1 : undefined,
					endExp: typeof m.maxExp === 'number' ? m.maxExp : bitLen(m.puzzleEnd),
				});
			} catch { } finally { setPuzzleLoading(false); }
		})();
	}, []);

	/* ── Checkwork addresses ──────────────────────────────────────── */
	useEffect(() => {
		(async () => {
			try {
				const token = localStorage.getItem('pool-token');
				if (!token || !userStats?.activeBlock?.id) { setCheckworkAddresses([]); return; }
				const res = await fetch('/api/block?only=true', { headers: { 'pool-token': token }, cache: 'no-store' });
				if (!res.ok) return;
				const data = await res.json();
				if (Array.isArray(data.checkwork_addresses)) setCheckworkAddresses(data.checkwork_addresses);
			} catch { }
		})();
	}, [userStats?.activeBlock?.id]);

	/* ── Average speed ────────────────────────────────────────────── */
	useEffect(() => {
		(async () => {
			try {
				const token = localStorage.getItem('pool-token');
				if (!token) return;
				const res = await fetch('/api/user/history', { headers: { 'pool-token': token }, cache: 'no-store' });
				if (!res.ok) return;
				const history = await res.json();
				const completed = (history.blocks || [] as HistoryBlock[])
					.filter((b: HistoryBlock) => b.status === 'COMPLETED' && b.assignedAt && (b.completedAt || b.solution?.createdAt))
					.sort((a: HistoryBlock, b: HistoryBlock) => {
						const ad = new Date(a.completedAt ?? a.solution?.createdAt ?? a.assignedAt!).getTime();
						const bd = new Date(b.completedAt ?? b.solution?.createdAt ?? b.assignedAt!).getTime();
						return bd - ad;
					})
					.slice(0, 10);

				if (!completed.length) { setAvgSpeedBKeys('0.00'); setAvgBlockDuration('—'); return; }

				let totalSeconds = 0;
				let totalSizeBI = 0n;
				for (const b of completed) {
					const dur = Math.max(1, Math.floor((new Date(b.completedAt ?? b.solution?.createdAt ?? b.assignedAt!).getTime() - new Date(b.assignedAt!).getTime()) / 1000));
					totalSeconds += dur;
					if (b.hexRangeStart && b.hexRangeEnd) {
						try {
							const sz = BigInt(b.hexRangeEnd) - BigInt(b.hexRangeStart);
							if (sz > 0n) totalSizeBI += sz;
						} catch { }
					}
				}

				const kps = Number(totalSizeBI) / Math.max(1, totalSeconds);
				let unit = 'Keys/s', num = kps;
				if (kps >= 1e15) { unit = 'PKeys/s'; num = kps / 1e15; }
				else if (kps >= 1e12) { unit = 'TKeys/s'; num = kps / 1e12; }
				else if (kps >= 1e9) { unit = 'BKeys/s'; num = kps / 1e9; }
				else if (kps >= 1e6) { unit = 'MKeys/s'; num = kps / 1e6; }
				else if (kps >= 1e3) { unit = 'KKeys/s'; num = kps / 1e3; }
				setAvgSpeedBKeys(`${num.toFixed(2)} ${unit}`);

				const avg = Math.max(1, Math.floor(totalSeconds / completed.length));
				setAvgBlockDuration(formatHHMMSS(avg));
			} catch { }
		})();
	}, [userStats?.completedBlocks]);

	/* ── Actions ──────────────────────────────────────────────────── */
	const generateToken = useCallback(async (address?: string) => {
		const addr = address ?? bitcoinAddress;
		if (!addr) { setBitcoinAddressError(tRef.current('dashboard.auth.enterAddress')); return; }
		if (!isValidBitcoinAddress(addr)) { setBitcoinAddressError(tRef.current('dashboard.auth.invalidAddress')); return; }
		try {
			setLoading(true); setError(null);
			const response = await fetch('/api/token/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bitcoinAddress: addr }),
			});
			if (!response.ok) { const d = await response.json(); throw new Error(d.error || 'Failed to generate token'); }
			const data = await response.json();
			localStorage.setItem('pool-token', data.token);
			await fetchUserStats();
			router.replace('/dashboard');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to generate token');
			setLoading(false);
		}
	}, [bitcoinAddress, fetchUserStats, router]);

	const applyManualToken = useCallback(async () => {
		if (!manualTokenInput.trim()) { setError(tRef.current('dashboard.auth.enterToken')); return; }
		localStorage.setItem('pool-token', manualTokenInput.trim());
		setManualTokenInput('');
		await fetchUserStats();
	}, [manualTokenInput, fetchUserStats]);

	const logout = useCallback(() => {
		localStorage.removeItem('pool-token');
		localStorage.removeItem(CACHE_KEY);
		setUserStats(null); setError(null); setBitcoinAddress(''); setManualTokenInput('');
		userStatsRef.current = null;
	}, []);

	const assignNewBlock = useCallback(async () => {
		try {
			setAssigningBlock(true);
			const token = localStorage.getItem('pool-token');
			if (!token) throw new Error('No token found. Please generate a token first.');
			const res = await fetch(`/api/block?length=${encodeURIComponent(blockLength)}`, {
				headers: { 'pool-token': token },
				cache: 'no-store',
			});
			if (!res.ok) throw new Error('Failed to assign new block');
			const data = await res.json();
			if (Array.isArray(data.checkwork_addresses)) setCheckworkAddresses(data.checkwork_addresses);
			await fetchUserStats();
			toast.success(tRef.current('dashboard.work.newBlockAssigned'));
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to assign new block';
			toast.error(msg);
		} finally {
			setAssigningBlock(false);
		}
	}, [blockLength, fetchUserStats]);

	const handleSubmitBlock = useCallback(async (e: React.FormEvent) => {
		e.preventDefault();
		if (!userStats?.activeBlock) { toast.error(tRef.current('dashboard.work.noActiveBlockToSubmit')); return; }

		const limited = parsedKeys.slice(0, 30);
		if (limited.length < 10) { toast.error(tRef.current('dashboard.work.submitMinKeys')); return; }
		const invalid = limited.filter(k => !/^(0x)?[0-9a-fA-F]{64}$/.test(k));
		if (invalid.length > 0) { toast.error(tRef.current('dashboard.submit.hexError')); return; }

		try {
			setSubmitting(true); setError(null);
			const token = localStorage.getItem('pool-token');
			if (!token) throw new Error('No token found');
			const response = await fetch('/api/block/submit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'pool-token': token },
				body: JSON.stringify({ privateKeys: limited, blockId: userStats.activeBlock.id }),
			});
			if (!response.ok) { const d = await response.json(); throw new Error(d.error || 'Failed to submit block'); }
			const data = await response.json();
			toast.success(tRef.current('dashboard.submit.blockSubmitted').replace('{n}', `${data.creditsAwarded}`));
			setKeysText('');
			await fetchUserStats();
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to submit block';
			toast.error(msg);
			setError(msg);
		} finally {
			setSubmitting(false);
		}
	}, [userStats?.activeBlock, parsedKeys, fetchUserStats]);

	const handleExtractHexKeys = useCallback(() => {
		const out = new Set<string>();
		for (const m of keysText.matchAll(/(?:0x)?([0-9a-fA-F]{64})/g)) out.add(`0x${m[1]}`);
		setKeysText(Array.from(out).join('\n'));
	}, [keysText]);

	const copyText = useCallback(async (text: string, onSuccess: () => void) => {
		try { await navigator.clipboard.writeText(text); onSuccess(); } catch { }
	}, []);

	/* ── Loading / Error / No-puzzle states ──────────────────────── */
	if (loading && !userStats) {
		return (
			<div className="min-h-screen bg-volt-bg flex items-center justify-center">
				<div className="text-center volt-fade-in">
					<div
						className="w-12 h-12 rounded-full border-2 border-transparent mx-auto mb-4"
						style={{ borderTopColor: '#fc5c04', animation: 'voltSpin 700ms linear infinite' }}
					/>
					<p className="text-[13px]" style={{ color: '#5c5a55' }}>{t('dashboard.loading')}</p>
				</div>
			</div>
		);
	}

	if (noPuzzle) {
		return (
			<div className="min-h-screen bg-volt-bg">
				<div className="max-w-3xl mx-auto px-4 sm:px-7 py-12">
					<PuzzleConfigNotice />
				</div>
			</div>
		);
	}

	/* ── Login / token page ───────────────────────────────────────── */
	if (!userStats || error?.toLowerCase().includes('token')) {
		return (
			<div className="min-h-screen bg-volt-bg volt-fade-in">
				<div className="max-w-3xl mx-auto px-4 sm:px-7 py-12">
					<div className="text-center mb-10">
						<div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#fc5c04' }}>
							{t('dashboard.auth.title')}
						</div>
						<h1 className="text-[30px] font-semibold mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>
							{t('dashboard.auth.subtitle')}
						</h1>
						{error && (
							<p className="text-[13px] mt-2" style={{ color: '#f0554a' }}>{error}</p>
						)}
						{!error && (
							<p className="text-[13px]" style={{ color: '#9a9892' }}>{t('dashboard.auth.needToken')}</p>
						)}
					</div>

					<div className="grid md:grid-cols-2 gap-5 mb-6">
						{/* Enter existing token */}
						<div className="volt-card">
							<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
								<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('dashboard.token.existing')}</div>
								<div className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.token.enterToken')}</div>
								<p className="text-[13px] mt-1" style={{ color: '#5c5a55' }}>{t('dashboard.token.description')}</p>
							</div>
							<div className="px-6 py-5">
								<form onSubmit={e => { e.preventDefault(); applyManualToken(); }} className="space-y-3">
									<div className="volt-input-wrap">
										<input
											type="text"
											value={manualTokenInput}
											onChange={e => setManualTokenInput(e.target.value)}
											placeholder={t('dashboard.token.placeholder')}
										/>
									</div>
									<button type="submit" className="volt-btn-primary w-full" disabled={!manualTokenInput.trim()}>
										{t('dashboard.token.load')}
									</button>
								</form>
							</div>
						</div>

						{/* Generate new token */}
						<div className="volt-card">
							<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
								<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('dashboard.newToken.badge')}</div>
								<div className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.newToken.title')}</div>
								<p className="text-[13px] mt-1" style={{ color: '#5c5a55' }}>{t('dashboard.newToken.description')}</p>
							</div>
							<div className="px-6 py-5 space-y-3">
								<div className="volt-input-wrap">
									<input
										type="text"
										value={bitcoinAddress}
										onChange={e => { setBitcoinAddress(e.target.value); setBitcoinAddressError(''); }}
										placeholder={t('dashboard.newToken.placeholder')}
									/>
								</div>
								{bitcoinAddressError && (
									<p className="text-[12px] flex items-center gap-1" style={{ color: '#f0554a' }}>
										<XCircle className="w-3.5 h-3.5" /> {bitcoinAddressError}
									</p>
								)}
								<button onClick={() => generateToken()} className="volt-btn-primary w-full" disabled={loading}>
									{loading ? t('dashboard.newToken.generating') : t('dashboard.newToken.generate')}
								</button>
							</div>
						</div>
					</div>

					{/* Puzzle info preview */}
					<div className="volt-card mb-6">
						<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
							<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('dashboard.puzzle.title')}</div>
							<div className="flex items-center gap-2">
								<Bitcoin className="h-4 w-4" style={{ color: '#fc5c04' }} />
								<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>
									{t('dashboard.puzzle.subtitle')}
								</span>
							</div>
						</div>
						<div className="px-6 py-5 space-y-3">
							<div>
								<label className="text-[12.5px] font-semibold block mb-1" style={{ color: '#9a9892' }}>{t('dashboard.puzzle.bitcoinAddress')}</label>
								<div className="rounded-[10px] p-3 font-mono text-[12px]" style={{ background: '#191919', border: '1px solid #262624', color: '#f4f3ee' }}>
									{puzzleMeta?.address || t('dashboard.puzzle.notConfigured')}
								</div>
							</div>
							<div>
								<label className="text-[12.5px] font-semibold block mb-1" style={{ color: '#9a9892' }}>{t('dashboard.puzzle.keyRange')}</label>
								<div className="rounded-[10px] p-3 font-mono text-[12px]" style={{ background: '#191919', border: '1px solid #262624', color: '#f4f3ee' }}>
									{puzzleMeta?.startExp !== undefined && puzzleMeta?.endExp !== undefined
										? `2^${puzzleMeta.startExp} … 2^${puzzleMeta.endExp}`
										: t('dashboard.puzzle.notAvailable')}
								</div>
							</div>
						</div>
					</div>

					{!puzzleLoading && <PuzzleInfoCard variant="dashboard" />}
				</div>
			</div>
		);
	}

	/* ── Main dashboard ───────────────────────────────────────────── */
	const completionRate = userStats.totalBlocks > 0
		? Math.round((userStats.completedBlocks / userStats.totalBlocks) * 100)
		: 0;

	const statCards = [
		{ label: t('dashboard.stats.totalBlocks'), value: formatNumber(userStats.totalBlocks), sub: t('dashboard.stats.completed').replace('{n}', `${userStats.completedBlocks}`), icon: Target, color: '#fc5c04' },
		{ label: t('dashboard.stats.availableCredits'), value: userStats.availableCredits.toFixed(3), sub: t('dashboard.stats.total').replace('{n}', `${userStats.totalCredits.toFixed(3)}`), icon: Coins, color: '#3ddc84' },
		{ label: t('dashboard.stats.estimatedPayout'), value: poolDist ? `${poolDist.expectedRewardBtc.toFixed(6)} BTC` : '…', sub: poolDist ? t('dashboard.stats.share').replace('{n}', `${poolDist.userSharePercent.toFixed(2)}`) : t('dashboard.stats.loading'), icon: Award, color: '#fc5c04' },
		{ label: t('dashboard.stats.pendingBlocks'), value: String(userStats.pendingBlocks), sub: t('dashboard.stats.awaitingCompletion'), icon: Clock, color: '#9a9892' },
		{ label: t('dashboard.stats.completionRate'), value: `${completionRate}%`, sub: t('dashboard.stats.successPercentage'), icon: Zap, color: completionRate >= 80 ? '#3ddc84' : '#fc5c04' },
		{ label: t('dashboard.stats.averageSpeed'), value: avgSpeedBKeys, sub: t('dashboard.stats.avgDuration').replace('{n}', avgBlockDuration), icon: Zap, color: '#fc5c04' },
		{ label: t('dashboard.stats.totalValidated'), value: formatTotalKeysLabel(userStats.totalKeysValidated), sub: t('dashboard.stats.totalTime').replace('{n}', formatHHMMSS(userStats.totalTimeSpentSeconds)), icon: CheckCircle2, color: '#3ddc84' },
	];

	if (poolDist && usdPrice && poolDist.expectedRewardBtc > 0) {
		statCards[2].sub += ` ≈ $${(poolDist.expectedRewardBtc * usdPrice).toFixed(2)}`;
	}

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
			<div className="max-w-7xl mx-auto px-4 sm:px-7 pt-5">

				{/* Top bar */}
				<div className="flex items-center justify-end gap-3 mb-6">
					<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11.5px]" style={{ background: '#191919', border: '1px solid #262624', color: '#9a9892' }}>
						<Clock className="h-3.5 w-3.5" />
						{t('dashboard.updated').replace('{n}', formatLastUpdated(lastUpdated, t))}
					</div>
					<button onClick={fetchUserStats} className="volt-btn-ghost text-[13px] px-3 py-1.5">
						{t('common.refresh')}
					</button>
				</div>

				{/* User session card */}
				<div className="volt-card mb-6">
					<div className="px-6 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" style={{ borderBottom: '1px solid #262624' }}>
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(252,92,4,0.1)', border: '1px solid rgba(252,92,4,0.15)' }}>
								<Key className="h-5 w-5" style={{ color: '#fc5c04' }} />
							</div>
							<div>
								<div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#fc5c04' }}>{t('dashboard.session.title')}</div>
								<div className="text-[18px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>
									{t('dashboard.session.subtitle')}
								</div>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<button onClick={() => router.push('/dashboard/transfer')} className="volt-btn-ghost text-[13px]">
								<Coins className="h-4 w-4" style={{ color: '#3ddc84' }} /> {t('dashboard.session.transfer')}
							</button>
							<button onClick={() => router.push('/dashboard/redeem')} className="volt-btn-ghost text-[13px]">
								<Award className="h-4 w-4" style={{ color: '#fc5c04' }} /> {t('dashboard.session.redeem')}
							</button>
							<button onClick={() => generateToken(userStats.bitcoinAddress)} className="volt-btn-ghost text-[13px]">
								<RotateCw className="h-4 w-4" /> {t('dashboard.session.rotate')}
							</button>
							<button onClick={logout} className="volt-btn-danger text-[13px]">
								<LogOut className="h-4 w-4" /> {t('dashboard.session.logout')}
							</button>
						</div>
					</div>
					<div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
						{/* Bitcoin address */}
						<div className="flex items-center gap-3 p-3 rounded-[10px]" style={{ background: '#191919', border: '1px solid #262624' }}>
							<Bitcoin className="h-4 w-4 shrink-0" style={{ color: '#fc5c04' }} />
							<div className="flex-1 min-w-0">
								<p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#5c5a55' }}>{t('dashboard.session.bitcoinAddress')}</p>
								<span className="text-[13px] font-mono break-all" style={{ color: '#f4f3ee' }}>{userStats.bitcoinAddress || 'N/A'}</span>
							</div>
							<button
								type="button"
								className="volt-btn-ghost p-2 rounded-full shrink-0"
								onClick={() => copyText(userStats.bitcoinAddress, () => { setCopiedAddress(true); setTimeout(() => setCopiedAddress(false), 1500); })}
							>
								{copiedAddress ? <CheckCircle2 className="h-4 w-4" style={{ color: '#3ddc84' }} /> : <Copy className="h-4 w-4" style={{ color: '#9a9892' }} />}
							</button>
						</div>
						{/* Token */}
						<div className="flex items-center gap-3 p-3 rounded-[10px]" style={{ background: '#191919', border: '1px solid #262624' }}>
							<Key className="h-4 w-4 shrink-0" style={{ color: '#fc5c04' }} />
							<div className="flex-1 min-w-0">
								<p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#5c5a55' }}>{t('dashboard.session.poolToken')}</p>
								<span className="text-[13px] font-mono break-all" style={{ color: '#f4f3ee' }}>
									{showFullToken ? userStats.token : `${userStats.token.substring(0, 12)}…`}
								</span>
							</div>
							<div className="flex gap-1 shrink-0">
								<button type="button" className="volt-btn-ghost p-2 rounded-full" onClick={() => setShowFullToken(v => !v)}>
									{showFullToken ? <EyeOff className="h-4 w-4" style={{ color: '#9a9892' }} /> : <Eye className="h-4 w-4" style={{ color: '#9a9892' }} />}
								</button>
								<button type="button" className="volt-btn-ghost p-2 rounded-full" onClick={() => copyText(userStats.token, () => { setCopiedToken(true); setTimeout(() => setCopiedToken(false), 1500); })}>
									{copiedToken ? <CheckCircle2 className="h-4 w-4" style={{ color: '#3ddc84' }} /> : <Copy className="h-4 w-4" style={{ color: '#9a9892' }} />}
								</button>
							</div>
						</div>
					</div>
				</div>

				{/* Stats grid */}
				<h2 className="text-[19px] font-semibold mb-4" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.stats.title')}</h2>
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
					{statCards.map(({ label, value, sub, icon: Icon, color }) => (
						<div key={label} className="volt-card p-4 flex flex-col justify-between" style={{ minHeight: 105 }}>
							<div className="flex items-center justify-between mb-2">
								<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{label}</span>
								<Icon className="h-4 w-4" style={{ color }} />
							</div>
							<div>
								<div className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color, letterSpacing: '-0.02em' }}>
									{value}
								</div>
								<p className="text-[11.5px] mt-0.5" style={{ color: '#5c5a55' }}>{sub}</p>
							</div>
						</div>
					))}
				</div>

				{/* Mining tabs */}
				<Tabs defaultValue="manual" className="mb-8">
					<TabsList className="grid grid-cols-2 max-w-xs mb-5 p-1 rounded-[10px]" style={{ background: '#191919', border: '1px solid #262624' }}>
						<TabsTrigger value="manual" className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-volt-accent data-[state=active]:text-volt-bg transition-all duration-150">
							<Cpu className="w-4 h-4 mr-1.5" /> {t('dashboard.tabs.gpu')}
						</TabsTrigger>
						<TabsTrigger value="browser" className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-volt-accent data-[state=active]:text-volt-bg transition-all duration-150">
							<Monitor className="w-4 h-4 mr-1.5" /> {t('dashboard.tabs.browser')}
						</TabsTrigger>
					</TabsList>

					<TabsContent value="manual">
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

							{/* Active block details */}
							<div className="lg:col-span-2">
								<div className="volt-card h-full">
									<div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262624' }}>
										<div>
											<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('dashboard.work.title')}</div>
											<div className="flex items-center gap-2">
												<Bitcoin className="h-4 w-4" style={{ color: '#fc5c04' }} />
												<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.work.subtitle')}</span>
											</div>
										</div>
										{userStats.activeBlock && (
											<button
												type="button"
												className="volt-btn-danger text-[12px]"
												onClick={() => setConfirmDeleteOpen(true)}
												disabled={deletingBlock}
											>
												<LogOut className="w-3.5 h-3.5" /> {deletingBlock ? t('dashboard.work.deleting') : t('dashboard.work.release')}
											</button>
										)}
									</div>
									<div className="px-6 py-5">
										{userStats.activeBlock ? (
											<div className="space-y-4">
												{/* Range */}
												<div className="p-4 rounded-[10px]" style={{ background: 'rgba(252,92,4,0.06)', border: '1px solid rgba(252,92,4,0.15)' }}>
													<div className="flex items-center justify-between gap-2">
														<div className="flex items-center gap-2 min-w-0">
															<span className="font-mono text-[12px] truncate" style={{ color: '#f4f3ee' }}>{formatCompactHexRange(userStats.activeBlock.startRange)}</span>
															<ArrowRight className="w-4 h-4 shrink-0" style={{ color: '#fc5c04' }} />
															<span className="font-mono text-[12px] truncate" style={{ color: '#f4f3ee' }}>{formatCompactHexRange(userStats.activeBlock.endRange)}</span>
														</div>
														<span className="volt-badge-accent shrink-0">
															{formatRangePowerLabel(userStats.activeBlock.startRange, userStats.activeBlock.endRange)}
														</span>
													</div>
													<p className="text-[11.5px] mt-2" style={{ color: '#3ddc84' }}>
														{formatKeysCountLabel(userStats.activeBlock.startRange, userStats.activeBlock.endRange)} {t('dashboard.work.keysInRange')}
													</p>
												</div>

												{/* Timestamps */}
												<div className="flex items-center justify-between text-[11.5px] flex-wrap gap-2">
													<span style={{ color: '#5c5a55' }}>
														{t('dashboard.work.assigned')} <span style={{ color: '#9a9892' }}>{formatAgo(userStats.activeBlock.assignedAt, t)}</span>
													</span>
													<span style={{ color: '#5c5a55' }}>
														{t('dashboard.work.expires')}{' '}
														<span style={{ color: new Date(userStats.activeBlock.expiresAt).getTime() <= Date.now() ? '#f0554a' : '#9a9892' }}>
															{formatUntil(userStats.activeBlock.expiresAt, t)}
														</span>
													</span>
												</div>

												{/* Checkwork */}
												<div>
													<h4 className="text-[12.5px] font-semibold mb-2" style={{ color: '#9a9892' }}>
														{t('dashboard.work.checkworkAddresses')} ({checkworkAddresses.length})
													</h4>
													<div className="space-y-1.5 max-h-48 overflow-y-auto">
														{checkworkAddresses.length > 0 ? checkworkAddresses.map((addr, idx) => (
															<div key={idx} className="flex items-center justify-between rounded-xl px-3 py-1.5" style={{ background: '#191919', border: '1px solid #262624' }}>
																<code className="text-[11.5px] font-mono break-all flex-1 pr-2" style={{ color: '#f4f3ee' }}>{addr}</code>
																<button
																	type="button"
																	onClick={() => copyText(addr, () => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1500); })}
																	className="shrink-0 ml-2"
																	style={{ color: '#9a9892' }}
																>
																	{copiedIdx === idx ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#3ddc84' }} /> : <Copy className="w-3.5 h-3.5" />}
																</button>
															</div>
														)) : (
															<p className="text-[12px]" style={{ color: '#5c5a55' }}>{t('dashboard.work.loadingCheckwork')}</p>
														)}
													</div>
													{checkworkAddresses.length > 0 && (
														<button
															type="button"
															className="volt-btn-ghost w-full mt-2 text-[13px]"
															onClick={() => copyText(checkworkAddresses.join('\n'), () => { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500); })}
														>
															{copiedAll ? <CheckCircle2 className="w-4 h-4" style={{ color: '#3ddc84' }} /> : <Copy className="w-4 h-4" />}
															{copiedAll ? t('dashboard.work.copied') : t('dashboard.work.copyAll')}
														</button>
													)}
												</div>
											</div>
										) : (
											<div className="text-center py-10">
												<Bitcoin className="w-10 h-10 mx-auto mb-3" style={{ color: '#3a3835' }} />
												<p className="text-[13px] mb-5" style={{ color: '#9a9892' }}>{t('dashboard.work.noActiveBlock')}</p>
												<div className="flex items-center justify-center gap-3 mb-4">
													<label className="text-[13px]" style={{ color: '#9a9892' }}>{t('dashboard.work.blockSize')}</label>
													<div className="volt-input-wrap" style={{ padding: '0 10px', borderRadius: 8 }}>
														<select
															value={blockLength}
															onChange={e => setBlockLength(e.target.value)}
															style={{ background: 'transparent', border: 'none', outline: 'none', padding: '8px 0', fontSize: 13, color: '#f4f3ee' }}
														>
															<option value="1T" style={{ background: '#191919' }}>1T</option>
															<option value="10T" style={{ background: '#191919' }}>10T</option>
															<option value="10B" style={{ background: '#191919' }}>10B</option>
															<option value="100T" style={{ background: '#191919' }}>100T</option>
														</select>
													</div>
												</div>
												<button
													onClick={assignNewBlock}
													disabled={assigningBlock || puzzleLoading}
													className="volt-btn-primary"
												>
													{assigningBlock ? (
														<><span className="w-4 h-4 rounded-full border-2 border-transparent inline-block" style={{ borderTopColor: '#0a0a0a', animation: 'voltSpin 700ms linear infinite' }} /> Assigning…</>
													) : t('dashboard.work.assignNewBlock')}
												</button>
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Key submission */}
							<div className="lg:col-span-1">
								<div className="volt-card h-full">
									<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
										<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('dashboard.submit.title')}</div>
										<div className="flex items-center gap-2">
											<Key className="h-4 w-4" style={{ color: '#fc5c04' }} />
											<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.submit.subtitle')}</span>
										</div>
										<p className="text-[13px] mt-1" style={{ color: '#5c5a55' }}>{t('dashboard.submit.pasteFoundKeys')}</p>
									</div>
									<div className="px-6 py-5 flex flex-col gap-4">
										<form onSubmit={handleSubmitBlock} className="flex flex-col gap-3 h-full">
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${validCount >= 10 ? 'volt-badge-success' : 'volt-badge-danger'}`}>
														{t('dashboard.submit.validCount').replace('{n}', `${validCount}`)}
													</span>
													<span className="volt-badge-neutral text-[11px]">{t('dashboard.submit.parsed')} {parsedKeys.length}</span>
												</div>
												<button
													type="button"
													className="volt-btn-ghost text-[12px] px-3 py-1.5"
													onClick={async () => { try { const clipText = await navigator.clipboard.readText(); setKeysText(clipText); } catch { } }}
												>
													{t('dashboard.submit.paste')}
												</button>
											</div>
											<label className="text-[12.5px] font-semibold" style={{ color: '#9a9892' }}>{t('dashboard.submit.label')}</label>
											<div className="volt-input-wrap" style={{ padding: '0', borderRadius: 10, alignItems: 'stretch' }}>
												<textarea
													value={keysText}
													onChange={e => setKeysText(e.target.value)}
													style={{ minHeight: 220, padding: '10px 12px', resize: 'vertical', fontFamily: 'var(--font-geist-mono)', fontSize: 12 }}
													placeholder={t('dashboard.submit.placeholder')}
													disabled={!userStats.activeBlock}
												/>
											</div>
											<div className="flex flex-wrap gap-2">
												<button type="submit" className="volt-btn-primary flex-1" disabled={submitting || !canSubmit || !userStats.activeBlock}>
													{submitting ? (
														<><span className="w-4 h-4 rounded-full border-2 border-transparent inline-block" style={{ borderTopColor: '#0a0a0a', animation: 'voltSpin 700ms linear infinite' }} /> {t('dashboard.submit.submitting')}</>
													) : t('dashboard.submit.submitKeys')}
												</button>
											</div>
											<div className="flex gap-2">
												<button type="button" onClick={handleExtractHexKeys} className="volt-btn-ghost text-[12px] flex-1">{t('dashboard.submit.extractHex')}</button>
												<button type="button" onClick={() => setKeysText('')} className="volt-btn-danger text-[12px] flex-1">{t('dashboard.submit.clear')}</button>
											</div>
											{error && !error.toLowerCase().includes('token') && (
												<p className="text-[12px] flex items-center gap-1" style={{ color: '#f0554a' }}>
													<XCircle className="w-3.5 h-3.5" /> {error}
												</p>
											)}
										</form>
									</div>
								</div>
							</div>
						</div>
					</TabsContent>

					<TabsContent value="browser">
						<BrowserMiner puzzleAddress={puzzleMeta?.address || undefined} />
					</TabsContent>
				</Tabs>

				{/* Quick links */}
				<h2 className="text-[19px] font-semibold mb-4" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.quickLinks.title')}</h2>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
					{[
						{
							icon: Bitcoin, title: t('dashboard.quickLinks.puzzleConfig'), desc: t('dashboard.quickLinks.puzzleConfigDesc'),
							badge: puzzleMeta?.address ? t('dashboard.quickLinks.configured') : t('dashboard.quickLinks.notConfigured'),
							badgeClass: puzzleMeta?.address ? 'volt-badge-success' : 'volt-badge-neutral',
							extra: puzzleMeta?.startExp && puzzleMeta?.endExp ? `2^${puzzleMeta.startExp}…2^${puzzleMeta.endExp}` : 'N/A',
						},
					].map(({ icon: Icon, title, desc, badge, badgeClass, extra }) => (
						<div key={title} className="volt-card p-5">
							<div className="flex items-center gap-2 mb-2">
								<Icon className="h-4 w-4" style={{ color: '#fc5c04' }} />
								<span className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{title}</span>
							</div>
							<p className="text-[13px] mb-3" style={{ color: '#5c5a55' }}>{desc}</p>
							<div className="flex items-center gap-2">
								<span className={badgeClass}>{badge}</span>
								<span className="volt-badge-neutral">{extra}</span>
							</div>
						</div>
					))}
					<div className="volt-card p-5">
						<div className="flex items-center gap-2 mb-2">
							<Target className="h-4 w-4" style={{ color: '#fc5c04' }} />
							<span className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.quickLinks.history')}</span>
						</div>
						<p className="text-[13px] mb-3" style={{ color: '#5c5a55' }}>{t('dashboard.quickLinks.historyDesc')}</p>
						<Link href="/history" className="volt-btn-primary text-[13px]">
							{t('dashboard.quickLinks.viewHistory')} <ArrowRight className="w-3.5 h-3.5" />
						</Link>
					</div>
					<div className="volt-card p-5">
						<div className="flex items-center gap-2 mb-2">
							<BookOpen className="h-4 w-4" style={{ color: '#fc5c04' }} />
							<span className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.quickLinks.docs')}</span>
						</div>
						<p className="text-[13px] mb-3" style={{ color: '#5c5a55' }}>{t('dashboard.quickLinks.docsDesc')}</p>
						<Link href="/docs/api" className="volt-btn-primary text-[13px]">
							{t('dashboard.quickLinks.viewDocs')} <ArrowRight className="w-3.5 h-3.5" />
						</Link>
					</div>
				</div>
			</div>

			{/* Delete block confirmation dialog */}
			{confirmDeleteOpen && (
				<div
					className="fixed inset-0 z-100 flex items-center justify-center p-5"
					style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
					onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteOpen(false); }}
				>
					<div
						className="w-full max-w-md volt-pop-in"
						style={{ background: '#131313', border: '1px solid #262624', borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.6)', overflow: 'hidden' }}
					>
						<div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid #262624' }}>
							<h3 className="text-[18px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('dashboard.releaseDialog.title')}</h3>
							<p className="text-[13px] mt-1" style={{ color: '#9a9892' }}>
								{t('dashboard.releaseDialog.description')}
							</p>
						</div>
						<div className="px-6 py-5 flex gap-3 justify-end">
							<button className="volt-btn-ghost" onClick={() => setConfirmDeleteOpen(false)}>{t('dashboard.releaseDialog.cancel')}</button>
							<button
								className="volt-btn-danger"
								disabled={deletingBlock}
								onClick={async () => {
									try {
										setDeletingBlock(true); setError(null);
										const token = localStorage.getItem('pool-token');
										if (!token) throw new Error('No token found');
										const r = await fetch('/api/block', { method: 'DELETE', headers: { 'pool-token': token } });
										if (!r.ok) {
											let msg = 'Failed to release block';
											try { const d = await r.json(); if (d?.error) msg = d.error; } catch { }
											throw new Error(msg);
										}
										setKeysText(''); setCheckworkAddresses([]);
										await fetchUserStats();
										setConfirmDeleteOpen(false);
										toast.success(t('dashboard.releaseDialog.released'));
									} catch (err) {
										const msg = err instanceof Error ? err.message : 'Failed to release block';
										toast.error(msg);
										setError(msg);
										setConfirmDeleteOpen(false);
									} finally { setDeletingBlock(false); }
								}}
							>
								{deletingBlock ? t('dashboard.releaseDialog.releasing') : t('dashboard.releaseDialog.release')}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
