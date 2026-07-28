"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Coins, History as HistoryIcon, ArrowLeft, ArrowRight } from "lucide-react";
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/contexts/LanguageContext";

interface HistoryBlock {
	id: string;
	hexRangeStart: string;
	hexRangeEnd: string;
	checkworkAddresses: string[];
	status: "ACTIVE" | "COMPLETED" | "EXPIRED" | string;
	assignedAt: string;
	completedAt?: string | null;
	expiresAt?: string | null;
	solution?: { id: string; creditsAwarded: number; createdAt: string } | null;
}

interface HistoryTransaction {
	id: string;
	type: string;
	amount: number;
	description: string;
	createdAt: string;
}

interface HistoryResponse {
	blocks: HistoryBlock[];
	transactions: HistoryTransaction[];
	blocksTotal: number;
	transactionsTotal: number;
	pageSize: number;
	blocksPage: number;
	transactionsPage: number;
}

function timeAgo(dt?: string | null): string {
	if (!dt) return '—';
	const s = Math.max(0, Math.floor((Date.now() - new Date(dt).getTime()) / 1000));
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

function formatKeys(start: string, end: string): string {
	try {
		const len = Number(BigInt(end) - BigInt(start));
		if (len <= 0) return '';
		let unit = 'Keys', num = len;
		if (len >= 1e15) { unit = 'PKeys'; num = len / 1e15; }
		else if (len >= 1e12) { unit = 'TKeys'; num = len / 1e12; }
		else if (len >= 1e9) { unit = 'BKeys'; num = len / 1e9; }
		else if (len >= 1e6) { unit = 'MKeys'; num = len / 1e6; }
		else if (len >= 1e3) { unit = 'KKeys'; num = len / 1e3; }
		return `2^${Math.log2(len).toFixed(2)} · ≈ ${num.toFixed(2)} ${unit}`;
	} catch { return ''; }
}

function StatusPill({ status }: { status: string }) {
	const map: Record<string, string> = {
		ACTIVE: 'volt-badge-accent',
		COMPLETED: 'volt-badge-success',
		EXPIRED: 'volt-badge-danger',
	};
	return <span className={map[status] ?? 'volt-badge-neutral'}>{status}</span>;
}

function BlockRow({ block, t }: { block: HistoryBlock; t: (k: string) => string }) {
	return (
		<Link
			href={`/block/${block.id}`}
			className="block transition-colors duration-150 hover:bg-volt-surface-raised rounded-xl"
		>
			<div className="px-4 py-4" style={{ borderBottom: '1px solid #262624' }}>
				<div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
					<div>
						<div className="flex items-center gap-2 mb-1">
							<span className="font-mono text-[12px]" style={{ color: '#9a9892' }}>{block.id.substring(0, 10)}…</span>
							<StatusPill status={block.status} />
						</div>
						<p className="text-[11.5px]" style={{ color: '#5c5a55' }}>
							{t('history.blockHistory.checkwork')} <span style={{ color: '#9a9892' }}>{block.checkworkAddresses?.length || 0}</span>
						</p>
					</div>
					<div className="md:col-span-2">
						<p className="font-mono text-[12px] truncate" style={{ color: '#f4f3ee' }}>
							{block.hexRangeStart} <span style={{ color: '#fc5c04' }}>→</span> {block.hexRangeEnd}
						</p>
						<p className="text-[11.5px] mt-0.5" style={{ color: '#5c5a55' }}>{formatKeys(block.hexRangeStart, block.hexRangeEnd)}</p>
					</div>
					<div className="text-right">
						<div className="text-[20px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#3ddc84', letterSpacing: '-0.02em' }}>
							{typeof block.solution?.creditsAwarded === 'number' ? block.solution.creditsAwarded.toFixed(3) : '0.000'}
						</div>
						<p className="text-[11.5px]" style={{ color: '#5c5a55' }}>{t('history.blockHistory.creditsEarned')}</p>
					</div>
				</div>
				<div className="mt-3 pt-3 grid grid-cols-2 gap-2 text-[11.5px]" style={{ borderTop: '1px solid #262624' }}>
					<span style={{ color: '#5c5a55' }}>
						{t('history.blockHistory.assigned')} <span style={{ color: '#9a9892' }}>{new Date(block.assignedAt).toLocaleString()}</span>
					</span>
					{block.status === 'COMPLETED' ? (
						<span style={{ color: '#5c5a55' }}>
							{t('history.blockHistory.completed')} <span style={{ color: '#3ddc84' }}>{timeAgo(block.completedAt ?? block.solution?.createdAt)}</span>
						</span>
					) : block.status === 'EXPIRED' ? (
						<span style={{ color: '#5c5a55' }}>
							{t('history.blockHistory.expired')} <span style={{ color: '#f0554a' }}>{timeAgo(block.expiresAt)}</span>
						</span>
					) : (
						<span style={{ color: '#5c5a55' }}>
							{t('history.blockHistory.expires')} <span style={{ color: '#9a9892' }}>{new Date(block.expiresAt ?? '').toLocaleString()}</span>
						</span>
					)}
				</div>
			</div>
		</Link>
	);
}

function TxTable({ transactions, t }: { transactions: HistoryTransaction[]; t: (k: string) => string }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-[13px]">
				<thead>
					<tr style={{ borderBottom: '1px solid #262624' }}>
						{[t('history.txHistory.type'), t('history.txHistory.descriptionCol'), t('history.txHistory.credits'), t('history.txHistory.date')].map(h => (
							<th key={h} className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{h}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{transactions.map(tx => (
						<tr key={tx.id} className="transition-colors duration-100 hover:bg-volt-surface-raised" style={{ borderBottom: '1px solid #262624' }}>
							<td className="px-4 py-3">
								<span className={tx.type === 'EARNED' ? 'volt-badge-success' : 'volt-badge-neutral'}>{tx.type === 'EARNED' ? t('history.txHistory.earned') : tx.type}</span>
							</td>
							<td className="px-4 py-3" style={{ color: '#9a9892' }}>{tx.description || `Tx: ${tx.id.substring(0, 8)}…`}</td>
							<td className="px-4 py-3 text-right font-semibold font-mono" style={{ color: tx.type === 'EARNED' ? '#3ddc84' : '#9a9892' }}>
								{tx.type === 'EARNED' ? '+' : ''}{tx.amount.toFixed(3)}
							</td>
							<td className="px-4 py-3 text-[11.5px]" style={{ color: '#5c5a55' }}>{new Date(tx.createdAt).toLocaleString()}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default function HistoryPage() {
	const { t } = useTranslation();
	const [history, setHistory] = useState<HistoryResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [blocksPage, setBlocksPage] = useState(1);
	const [transactionsPage, setTransactionsPage] = useState(1);
	const [activeTab, setActiveTab] = useState<"blocks" | "transactions">("blocks");
	const pageSize = 50;

	useEffect(() => {
		setLoading(true); setError(null);
		(async () => {
			try {
				const token = localStorage.getItem("pool-token");
				if (!token) { setError("Token not found. Go to the dashboard to generate one."); setLoading(false); return; }
				const params = new URLSearchParams({ pageSize: String(pageSize), blocksPage: String(blocksPage), transactionsPage: String(transactionsPage) });
				const res = await fetch(`/api/user/history?${params}`, { headers: { "pool-token": token } });
				if (!res.ok) throw new Error(await res.text() || "Failed to fetch history");
				setHistory(await res.json());
			} catch (err) { setError(err instanceof Error ? err.message : String(err)); }
			finally { setLoading(false); }
		})();
	}, [blocksPage, transactionsPage]);

	const stats = useMemo(() => {
		const totalBlocks = history?.blocksTotal || 0;
		const completed = history?.blocks.filter(b => b.status === "COMPLETED").length || 0;
		const active = history?.blocks.filter(b => b.status === "ACTIVE").length || 0;
		const earned = (history?.transactions || []).filter(t => t.type === "EARNED").reduce((s, t) => s + t.amount, 0);
		const spent = (history?.transactions || []).filter(t => t.type !== "EARNED").reduce((s, t) => s + t.amount, 0);
		return { totalBlocks, completed, active, balance: earned + spent };
	}, [history]);

	const blocksTotalPages = Math.max(1, Math.ceil((history?.blocksTotal || 0) / pageSize));
	const txTotalPages = Math.max(1, Math.ceil((history?.transactionsTotal || 0) / pageSize));

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
			<div className="max-w-7xl mx-auto px-4 sm:px-7 py-10">

				{/* Page header */}
				<div className="mb-8">
					<div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: '#fc5c04' }}>{t('history.account')}</div>
					<div className="flex items-center gap-2">
						<HistoryIcon className="w-5 h-5" style={{ color: '#fc5c04' }} />
						<h1 className="text-[30px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('history.title')}</h1>
					</div>
					<p className="text-[13px] mt-1" style={{ color: '#5c5a55' }}>{t('history.description')}</p>
				</div>

				{loading && (
					<div className="volt-card p-5 mb-6 flex items-center gap-3">
						<div className="w-5 h-5 rounded-full border-2 border-transparent" style={{ borderTopColor: '#fc5c04', animation: 'voltSpin 700ms linear infinite' }} />
						<span className="text-[13px]" style={{ color: '#9a9892' }}>{t('history.loading')}</span>
					</div>
				)}

				{error && (
					<div className="volt-card p-5 mb-6">
						<p className="text-[13px]" style={{ color: '#f0554a' }}>{error}</p>
					</div>
				)}

				{!error && history && (
					<>
						{/* Stats */}
						<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
							{[
								{ label: t('history.stats.totalBlocks'), value: String(stats.totalBlocks), icon: HistoryIcon, color: '#fc5c04' },
								{ label: t('history.stats.completed'), value: String(stats.completed), icon: CheckCircle2, color: '#3ddc84', sub: t('history.stats.onThisPage') },
								{ label: t('history.stats.active'), value: String(stats.active), icon: Clock, color: '#fc5c04', sub: t('history.stats.onThisPage') },
								{ label: t('history.stats.creditBalance'), value: stats.balance.toFixed(3), icon: Coins, color: stats.balance >= 0 ? '#3ddc84' : '#f0554a', sub: t('history.stats.netThisPage') },
							].map(({ label, value, icon: Icon, color, sub }) => (
								<div key={label} className="volt-card p-4 flex flex-col justify-between" style={{ minHeight: 90 }}>
									<div className="flex items-center justify-between mb-2">
										<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#5c5a55' }}>{label}</span>
										<Icon className="h-4 w-4" style={{ color }} />
									</div>
									<div className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color, letterSpacing: '-0.02em' }}>{value}</div>
									{sub && <p className="text-[11.5px]" style={{ color: '#5c5a55' }}>{sub}</p>}
								</div>
							))}
						</div>

						<Tabs value={activeTab} onValueChange={v => setActiveTab(v as "blocks" | "transactions")}>
							<TabsList className="mb-5 p-1 rounded-[10px]" style={{ background: '#191919', border: '1px solid #262624' }}>
								<TabsTrigger value="blocks" className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-volt-accent data-[state=active]:text-volt-bg transition-all duration-150">
									<HistoryIcon className="w-4 h-4 mr-1.5" /> Blocks ({history.blocksTotal})
								</TabsTrigger>
								<TabsTrigger value="transactions" className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-volt-accent data-[state=active]:text-volt-bg transition-all duration-150">
									<Coins className="w-4 h-4 mr-1.5" /> Transactions ({history.transactionsTotal})
								</TabsTrigger>
							</TabsList>

							<TabsContent value="blocks">
								<div className="volt-card">
									<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
										<div className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('history.blockHistory.title')}</div>
										<p className="text-[13px] mt-1" style={{ color: '#5c5a55' }}>{t('history.blockHistory.description')}</p>
									</div>
									{history.blocks.length === 0 ? (
										<div className="px-6 py-10 text-center text-[13px]" style={{ color: '#5c5a55' }}>{t('history.blockHistory.noBlocks')}</div>
									) : (
										<div className="px-2">
											{history.blocks.map(b => <BlockRow key={b.id} block={b} t={t} />)}
										</div>
									)}
									<div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid #262624' }}>
										<span className="text-[12px]" style={{ color: '#5c5a55' }}>
											{t('common.page')} <span style={{ color: '#f4f3ee' }}>{blocksPage}</span> {t('common.of')} {blocksTotalPages}
										</span>
										<div className="flex gap-2">
											<button className="volt-btn-ghost text-[12px] px-3 py-1.5" disabled={loading || blocksPage <= 1} onClick={() => setBlocksPage(p => Math.max(1, p - 1))}>
												<ArrowLeft className="w-3.5 h-3.5" /> {t('common.prev')}
											</button>
											<button className="volt-btn-ghost text-[12px] px-3 py-1.5" disabled={loading || blocksPage >= blocksTotalPages} onClick={() => setBlocksPage(p => p + 1)}>
												{t('common.next')} <ArrowRight className="w-3.5 h-3.5" />
											</button>
										</div>
									</div>
								</div>
							</TabsContent>

							<TabsContent value="transactions">
								<div className="volt-card">
									<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
										<div className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('history.txHistory.title')}</div>
										<p className="text-[13px] mt-1" style={{ color: '#5c5a55' }}>{t('history.txHistory.description')}</p>
									</div>
									{history.transactions.length === 0 ? (
										<div className="px-6 py-10 text-center text-[13px]" style={{ color: '#5c5a55' }}>{t('history.txHistory.noTransactions')}</div>
									) : (
										<TxTable transactions={history.transactions} t={t} />
									)}
									<div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid #262624' }}>
										<span className="text-[12px]" style={{ color: '#5c5a55' }}>
											{t('common.page')} <span style={{ color: '#f4f3ee' }}>{transactionsPage}</span> {t('common.of')} {txTotalPages}
										</span>
										<div className="flex gap-2">
											<button className="volt-btn-ghost text-[12px] px-3 py-1.5" disabled={loading || transactionsPage <= 1} onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}>
												<ArrowLeft className="w-3.5 h-3.5" /> {t('common.prev')}
											</button>
											<button className="volt-btn-ghost text-[12px] px-3 py-1.5" disabled={loading || transactionsPage >= txTotalPages} onClick={() => setTransactionsPage(p => p + 1)}>
												{t('common.next')} <ArrowRight className="w-3.5 h-3.5" />
											</button>
										</div>
									</div>
								</div>
							</TabsContent>
						</Tabs>
					</>
				)}
			</div>
		</div>
	);
}
