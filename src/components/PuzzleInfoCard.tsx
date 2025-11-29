'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
// Assumindo que Button utiliza o estilo padrão (hover, etc.)
import { Button } from '@/components/ui/button'
import { Bitcoin, Copy, CheckCircle2, Wallet, Coins } from 'lucide-react'

type Variant = 'home' | 'dashboard' | 'overview'

type Info = {
	address: string
	txCount: number
	balanceBtc: number
	balanceUsd: number
	puzzleDetected?: boolean
}

export default function PuzzleInfoCard({ variant = 'dashboard' }: { variant?: Variant }) {
	const [info, setInfo] = useState<Info | null>(null)
	const [copied, setCopied] = useState(false)

	// Lógica de Fetch (Mantida)
	useEffect(() => {
		let mounted = true
			; (async () => {
				try {
					const r = await fetch('/api/puzzle/info')
					if (!r.ok) { if (mounted) setInfo(null); return }
					const j = await r.json()
					if (mounted) setInfo(j)
				} catch { }
			})()
		return () => { mounted = false }
	}, [])

	const fmtUsd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
	const fmtBtc = (n: number) => `${n.toFixed(8)} BTC`

	const header = variant === 'home' ? 'Current Puzzle' : variant === 'overview' ? 'Puzzle Status' : 'Puzzle Information'
	const desc = variant === 'home' ? 'Live address and balance' : variant === 'overview' ? 'Address, balance, and transactions' : 'Puzzle address, transactions, and balances'

	return (
		// PADRÃO 1: Card com sombra (exceto em 'overview' onde é frequentemente embutido)
		<Card className={`border-gray-200 transition-shadow ${variant === 'overview' ? 'bg-white' : 'bg-white shadow-sm hover:shadow-md'}`}>
			<CardHeader className='border-b pb-4'>
				<div className="flex items-center justify-between">
					{/* PADRÃO 2: Título com gray-900 e ícone blue-600 */}
					<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
						<Bitcoin className="h-5 w-5 text-blue-600" />{header}
					</CardTitle>
					{info?.puzzleDetected ? (
						<span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium border border-green-300">
							<span className="relative flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
								<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
							</span>
							Puzzle Key Found
						</span>
					) : null}
				</div>
				{/* PADRÃO 3: Descrição com gray-600 */}
				<CardDescription className="text-gray-600">{desc}</CardDescription>
			</CardHeader>

			<CardContent className="pt-6">
				{info ? (
					<div className="space-y-4">
						{/* Linha 1: Endereço Bitcoin */}
						<div className="col-span-1 md:col-span-3">
							<label className="text-sm text-gray-600 font-medium">Target Bitcoin Address</label>
							<div className="flex items-center justify-between bg-gray-100 border border-gray-200 p-3 rounded-lg mt-1">
								{/* Cor de código padronizada para azul */}
								<code className="text-gray-800 font-mono text-sm break-all select-all flex-1 pr-3">{info.address}</code>
								<Button
									type="button"
									className="bg-transparent hover:bg-gray-200 p-2 rounded-full"
									onClick={async () => {
										try {
											await navigator.clipboard.writeText(info.address);
											setCopied(true);
											setTimeout(() => setCopied(false), 1500);
										} catch { }
									}}
								>
									{copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-600" />}
								</Button>
							</div>
						</div>

						{/* Linhas 2-4: Métricas em um Grid de 3 Colunas */}
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">

							{/* Transações */}
							<div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
								<div className="text-sm text-gray-600 font-medium">Transactions</div>
								<div className="text-xl font-bold text-gray-900 flex items-center gap-2 mt-1">
									<Wallet className="h-5 w-5 text-blue-600" />{info.txCount}
								</div>
								<div className="text-xs text-gray-600 mt-1">Total on-chain transactions</div>
							</div>

							{/* Balance (BTC) */}
							<div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
								<div className="text-sm text-gray-600 font-medium">Balance (BTC)</div>
								<div className="text-xl font-bold text-gray-900 mt-1">{fmtBtc(info.balanceBtc)}</div>
								<div className="text-xs text-gray-600 mt-1">Confirmed balance</div>
							</div>

							{/* USD Value */}
							<div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
								<div className="text-sm text-gray-600 font-medium">USD Value</div>
								<div className="text-xl font-bold text-gray-900 flex items-center gap-2 mt-1">
									<Coins className="h-5 w-5 text-green-600" />{fmtUsd(info.balanceUsd)}
								</div>
								<div className="text-xs text-gray-600 mt-1">Converted at current price</div>
							</div>
						</div>
					</div>
				) : (
					// Loader Padronizado
					<div className="bg-white border border-gray-200 rounded-md p-4 animate-pulse shadow-sm">
						<div className="h-4 w-1/3 bg-gray-200 rounded mb-3" />
						<div className="h-6 w-full bg-gray-200 rounded mb-4" />
						<div className="grid grid-cols-3 gap-4">
							<div className='h-12 bg-gray-100 rounded' />
							<div className='h-12 bg-gray-100 rounded' />
							<div className='h-12 bg-gray-100 rounded' />
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}