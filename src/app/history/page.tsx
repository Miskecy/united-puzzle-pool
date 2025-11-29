"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Coins, History as HistoryIcon, ArrowLeft, ArrowRight } from "lucide-react";

// Adicionar componentes Shadcn/UI necessários (assumindo que você os tem)
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button"; // Melhor usar um Button mais formal

// --- Interfaces (Sem Alteração) ---

interface HistoryBlock {
	id: string;
	hexRangeStart: string;
	hexRangeEnd: string;
	checkworkAddresses: string[];
	status: "ACTIVE" | "COMPLETED" | "EXPIRED" | string;
	assignedAt: string;
	completedAt?: string | null;
	expiresAt?: string | null;
	solution?: {
		id: string;
		creditsAwarded: number;
		createdAt: string;
	} | null;
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

// --- Componente de Badge de Status Aprimorado ---

function StatusBadge({ status }: { status: string }) {
	let text = status;

	switch (status) {
		case "ACTIVE":
			text = "Active";
			return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">{text}</Badge>;
		case "COMPLETED":
			text = "Completed";
			return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">{text}</Badge>;
		case "EXPIRED":
			text = "Expired";
			return <Badge variant="destructive">{text}</Badge>;
		default:
			text = status.toUpperCase();
			return <Badge variant="secondary">{text}</Badge>;
	}
}

// --- Componente de Botão de Paginação (Usando Shadcn/UI Button) ---

function PaginationButton(props: React.ComponentProps<typeof Button> & { disabled?: boolean, children: React.ReactNode }) {
	const { children, disabled, ...rest } = props;
	return (
		<Button
			{...rest}
			variant="outline"
			size="sm"
			disabled={disabled}
			className="text-gray-800"
		>
			{children}
		</Button>
	);
}

// --- Componente de Item de Bloco ---

function HistoryBlockItem({ block }: { block: HistoryBlock }) {
	const formatKeys = (start: string, end: string) => {
		try {
			const len = Number(BigInt(end) - BigInt(start));
			if (len <= 0) return '';
			const pow = `2^${Math.log2(len).toFixed(2)}`;
			let unit = 'Keys', num = len;
			// Simplificação para melhor leitura
			if (len >= 1e15) { unit = 'PKeys'; num = len / 1e15; }
			else if (len >= 1e12) { unit = 'TKeys'; num = len / 1e12; }
			else if (len >= 1e9) { unit = 'BKeys'; num = len / 1e9; }
			else if (len >= 1e6) { unit = 'MKeys'; num = len / 1e6; }
			else if (len >= 1e3) { unit = 'KKeys'; num = len / 1e3; }
			return `${pow} • ≈ ${num.toFixed(2)} ${unit}`;
		} catch {
			return '';
		}
	};

	const [nowMs, setNowMs] = useState<number>(0);
	useEffect(() => {
		const tm = setTimeout(() => { setNowMs(Date.now()); }, 0);
		const i = setInterval(() => { setNowMs(Date.now()); }, 60000);
		return () => { clearTimeout(tm); clearInterval(i); };
	}, []);

	const timeAgo = (dt?: string | null, now?: number): string => {
		if (!dt || !now) return '—';
		const t = new Date(dt).getTime();
		const s = Math.max(0, Math.floor((now - t) / 1000));
		if (s < 60) return `${s}s ago`;
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}min ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		return `${d}d ago`;
	};

	const formatDate = (date: string | null | undefined, defaultValue: string = "—") => {
		return date ? new Date(date).toLocaleString() : defaultValue;
	};

	return (
		<li className="bg-white border-b">
			<Link href={`/block/${block.id}`} className="block transition-colors cursor-pointer hover:bg-gray-50 px-4 py-4">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
					<div className="col-span-1">
						<div className="flex items-center gap-2">
							<span className="font-mono text-sm text-blue-700 font-medium truncate">{block.id.substring(0, 8)}...</span>
							<StatusBadge status={block.status} />
						</div>
						<p className="text-xs text-gray-500 mt-1">
							Checkwork: <span className="font-semibold">{block.checkworkAddresses?.length || 0}</span>
						</p>
					</div>

					<div className="col-span-2 text-sm">
						<p className="font-mono text-gray-700">
							{block.hexRangeStart} <span className="text-gray-400">→</span> {block.hexRangeEnd}
						</p>
						<p className="text-xs text-gray-500 mt-1">
							{formatKeys(block.hexRangeStart, block.hexRangeEnd)}
						</p>
					</div>

					<div className="col-span-1 text-right">
						<div className="text-lg font-bold text-green-700">
							{typeof block.solution?.creditsAwarded === 'number' ? block.solution.creditsAwarded.toFixed(3) : '0.000'}
						</div>
						<p className="text-xs text-gray-500">Credits Earned</p>
					</div>
				</div>

				<div className="mt-2 text-xs text-gray-500 border-t pt-2 grid grid-cols-3 gap-2">
					<p>Assigned: <span className="font-semibold">{formatDate(block.assignedAt)}</span></p>
					{block.status === 'COMPLETED' ? (
						<div className="flex items-center gap-2">
							<p>Completed: <span className="font-semibold">{formatDate(block.completedAt ?? block.solution?.createdAt ?? null)}</span></p>
							<Badge className="bg-green-100 text-green-800 border border-green-300">
								{timeAgo(block.completedAt ?? block.solution?.createdAt ?? null, nowMs)}
							</Badge>
						</div>
					) : block.status === 'EXPIRED' ? (
						<div className="flex items-center gap-2">
							<p>Expired: <span className="font-semibold">{formatDate(block.expiresAt)}</span></p>
							<Badge className="bg-red-100 text-red-800 border border-red-300">
								{timeAgo(block.expiresAt, nowMs)}
							</Badge>
						</div>
					) : (
						<p>Expires: <span className="font-semibold">{formatDate(block.expiresAt)}</span></p>
					)}
				</div>
			</Link>
		</li>
	);
}

// --- Componente da Tabela de Transação (Melhor UX para dados tabulares) ---

function HistoryTransactionTable({ transactions }: { transactions: HistoryTransaction[] }) {
	const formatDate = (date: string) => new Date(date).toLocaleString();

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[100px]">Tipo</TableHead>
						<TableHead>Descrição</TableHead>
						<TableHead className="text-right">Créditos</TableHead>
						<TableHead className="w-[180px]">Data</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{transactions.map((t) => (
						<TableRow key={t.id}>
							<TableCell>
								<Badge variant={t.type === "EARNED" ? "default" : "secondary"} className={t.type === "EARNED" ? "bg-blue-500 hover:bg-blue-600" : ""}>
									{t.type}
								</Badge>
							</TableCell>
							<TableCell className="font-medium">
								<span className="text-gray-700">{t.description || `Transação ID: ${t.id.substring(0, 8)}...`}</span>
							</TableCell>
							<TableCell className={`text-right font-semibold ${t.type === "EARNED" ? "text-green-600" : "text-gray-800"}`}>
								{t.type === "EARNED" ? `+${t.amount.toFixed(3)}` : t.amount.toFixed(3)}
							</TableCell>
							<TableCell className="text-xs text-gray-500">
								{formatDate(t.createdAt)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

// --- Componente Principal ---

export default function HistoryPage() {
	const [history, setHistory] = useState<HistoryResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [blocksPage, setBlocksPage] = useState(1);
	const [transactionsPage, setTransactionsPage] = useState(1);
	const [, setActiveTab] = useState("blocks");
	const pageSize = 50;

	useEffect(() => {
		// Redefina o estado de carregamento se a página mudar
		setLoading(true);
		setError(null);

		const fetchHistory = async () => {
			try {
				const token = localStorage.getItem("pool-token");
				if (!token) {
					setError("Token not found. Generate or paste your token in the dashboard.");
					setLoading(false);
					return;
				}

				const params = new URLSearchParams({
					pageSize: String(pageSize),
					blocksPage: String(blocksPage),
					transactionsPage: String(transactionsPage),
				});
				const res = await fetch(`/api/user/history?${params.toString()}`, {
					headers: { "pool-token": token },
				});
				if (!res.ok) {
					const msg = await res.text();
					throw new Error(msg || "Failed to fetch history");
				}
				const data: HistoryResponse = await res.json();
				setHistory(data);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setLoading(false);
			}
		};

		fetchHistory();
	}, [blocksPage, transactionsPage]);

	const stats = useMemo(() => {
		// Estatísticas totais são mais relevantes
		const totalBlocks = history?.blocksTotal || 0;
		// Estas estatísticas de "bloco" devem ser do total, não apenas da página
		// Como o endpoint só retorna os dados da página, vou mantê-los para a página atual para referência.
		const completed = history?.blocks.filter(b => b.status === "COMPLETED").length || 0;
		const active = history?.blocks.filter(b => b.status === "ACTIVE").length || 0;

		// O cálculo do saldo deve ser feito de forma mais robusta, idealmente a partir de um campo de saldo real na resposta da API.
		// Assumindo que o saldo pode ser calculado a partir das transações *da página atual*.
		const earned = (history?.transactions || []).filter(t => t.type === "EARNED").reduce((sum, t) => sum + t.amount, 0);
		const spent = (history?.transactions || []).filter(t => t.type !== "EARNED").reduce((sum, t) => sum + t.amount, 0);
		// O saldo é a soma (créditos ganhos - créditos gastos)
		const balance = earned + spent;

		return { totalBlocks, completed, active, earned, balance };
	}, [history]);

	const blocksTotalPages = Math.max(1, Math.ceil((history?.blocksTotal || 0) / pageSize));
	const transactionsTotalPages = Math.max(1, Math.ceil((history?.transactionsTotal || 0) / pageSize));

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			<div className="mb-8 border-b pb-4">
				<div className="flex items-center gap-2 mb-2">
					<HistoryIcon className="w-6 h-6 text-blue-600" />
					<h1 className="text-3xl font-extrabold text-gray-900">Activity History</h1>
				</div>
				<p className="text-md text-gray-600">Track your processed blocks and credit transactions.</p>
			</div>

			{/* --- Seção de Status e Erro --- */}
			{loading && (
				<Card className="border-blue-200 bg-blue-50 mb-6">
					<CardContent className="pt-6">
						<div className="flex items-center gap-3">
							<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
							<span className="text-blue-700 font-medium">Loading history...</span>
						</div>
					</CardContent>
				</Card>
			)}

			{error && (
				<Card className="border-red-400 bg-red-100 mb-6">
					<CardContent className="pt-6">
						<div className="text-red-800 font-medium text-sm">{error}</div>
					</CardContent>
				</Card>
			)}

			{!loading && !error && history && (
				<>
					{/* --- Cartões de Estatísticas --- */}
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
						<Card className="shadow-lg hover:shadow-xl transition-shadow">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium text-gray-500">Total Blocks</CardTitle>
								<HistoryIcon className="w-4 h-4 text-gray-400" />
							</CardHeader>
							<CardContent>
								<div className="text-3xl font-bold">{stats.totalBlocks}</div>
								<p className="text-xs text-gray-500">Total blocks tracked</p>
							</CardContent>
						</Card>
						<Card className="shadow-lg hover:shadow-xl transition-shadow">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium text-gray-500">Completed (Page)</CardTitle>
								<CheckCircle2 className="w-4 h-4 text-green-500" />
							</CardHeader>
							<CardContent>
								<div className="text-3xl font-bold">{stats.completed}</div>
								<p className="text-xs text-gray-500">on current page</p>
							</CardContent>
						</Card>
						<Card className="shadow-lg hover:shadow-xl transition-shadow">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium text-gray-500">Active (Page)</CardTitle>
								<Clock className="w-4 h-4 text-blue-500" />
							</CardHeader>
							<CardContent>
								<div className="text-3xl font-bold">{stats.active}</div>
								<p className="text-xs text-gray-500">on current page</p>
							</CardContent>
						</Card>
						<Card className="shadow-lg hover:shadow-xl transition-shadow border">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium text-gray-500">Credit Balance</CardTitle>
								<Coins className="w-4 h-4 text-yellow-600" />
							</CardHeader>
							<CardContent>
								<div className={`text-3xl font-bold ${stats.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
									{stats.balance.toFixed(3)}
								</div>
								<p className="text-xs text-gray-500">Credits (net earned on this page)</p>
							</CardContent>
						</Card>
					</div>

					{/* --- Guias de Blocos e Transações --- */}
					<Tabs defaultValue="blocks" className="w-full" onValueChange={setActiveTab}>
						<TabsList className="grid w-full grid-cols-2 mb-4">
							<TabsTrigger value="blocks" className="inline-flex items-center gap-2">
								<HistoryIcon className="w-4 h-4" />
								<span>Blocks ({history.blocksTotal})</span>
							</TabsTrigger>
							<TabsTrigger value="transactions" className="inline-flex items-center gap-2">
								<Coins className="w-4 h-4" />
								<span>Transactions ({history.transactionsTotal})</span>
							</TabsTrigger>
						</TabsList>

						<TabsContent value="blocks">
							<Card className="shadow-md">
								<CardHeader className="border-b">
									<CardTitle>Block History</CardTitle>
									<CardDescription>Assigned blocks and their processing status.</CardDescription>
								</CardHeader>
								<CardContent className="pt-6">
									{history.blocks.length === 0 ? (
										<div className="text-center py-10 text-gray-500">No blocks found.</div>
									) : (
										<ul className="divide-y divide-gray-200">
											{history.blocks.map((b) => (
												<HistoryBlockItem key={b.id} block={b} />
											))}
										</ul>
									)}

									{/* Paginação de Blocos */}
									<div className="flex items-center justify-between mt-6 pt-4 border-t">
										<div className="text-sm text-gray-600">
											Page <span className="font-semibold">{blocksPage}</span> of <span className="font-semibold">{blocksTotalPages}</span> (Total: {history.blocksTotal} Blocks)
										</div>
										<div className="flex items-center gap-2">
											<PaginationButton
												disabled={blocksPage <= 1}
												onClick={() => setBlocksPage(p => Math.max(1, p - 1))}
											>
												<ArrowLeft className="w-4 h-4 mr-1" /> Previous
											</PaginationButton>
											<PaginationButton
												disabled={blocksPage >= blocksTotalPages}
												onClick={() => setBlocksPage(p => p + 1)}
											>
												Next <ArrowRight className="w-4 h-4 ml-1" />
											</PaginationButton>
										</div>
									</div>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="transactions">
							<Card className="shadow-md">
								<CardHeader className="border-b">
									<CardTitle>Transaction History</CardTitle>
									<CardDescription>Incoming and outgoing credits.</CardDescription>
								</CardHeader>
								<CardContent className="pt-6">
									{history.transactions.length === 0 ? (
										<div className="text-center py-10 text-gray-500">No transactions found.</div>
									) : (
										<HistoryTransactionTable transactions={history.transactions} />
									)}

									{/* Paginação de Transações */}
									<div className="flex items-center justify-between mt-6 pt-4 border-t">
										<div className="text-sm text-gray-600">
											Page <span className="font-semibold">{transactionsPage}</span> of <span className="font-semibold">{transactionsTotalPages}</span> (Total: {history.transactionsTotal} Transactions)
										</div>
										<div className="flex items-center gap-2">
											<PaginationButton
												disabled={transactionsPage <= 1}
												onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}
											>
												<ArrowLeft className="w-4 h-4 mr-1" /> Previous
											</PaginationButton>
											<PaginationButton
												disabled={transactionsPage >= transactionsTotalPages}
												onClick={() => setTransactionsPage(p => p + 1)}
											>
												Next <ArrowRight className="w-4 h-4 ml-1" />
											</PaginationButton>
										</div>
									</div>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</>
			)}
		</div>
	);
}
