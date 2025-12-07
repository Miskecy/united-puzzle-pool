'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sigma, Calculator, Key, Hash, Link as LinkIcon, Text, Plus, Minus, RotateCw } from 'lucide-react'

export default function ToolPage() {
	const [input, setInput] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [precision, setPrecision] = useState(2)

	function bitLength(n: bigint): number { if (n === 0n) return 0; let len = 0; let v = n; while (v > 0n) { v >>= 1n; len++ } return len }
	function isPowerOfTwo(n: bigint): boolean { return n > 0n && (n & (n - 1n)) === 0n }
	function formatDiv(n: bigint, unit: bigint, decimals: number = 2): string { const whole = n / unit; const rem = n % unit; if (decimals <= 0) return whole.toString(); const scale = BigInt(10 ** decimals); const frac = (rem * scale) / unit; const fracStr = frac.toString().padStart(decimals, '0'); return `${whole.toString()}.${fracStr}` }

	async function runOp(op: string) {
		setLoading(true); setError(null)
		const isLocalOp = op === 'pow_to_decimal' || op === 'decimal_to_pow' || op === 'pow_to_keys' || op === 'pow_to_keys_all'
		try {
			if (isLocalOp) {
				const lines = input.split(/\r?\n/)
				const outputs: string[] = []
				const errs: (string | null)[] = []
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i].trim()
					if (!line) { outputs.push(''); errs.push(null); continue }
					if (op === 'pow_to_decimal' || op === 'pow_to_keys' || op === 'pow_to_keys_all') {
						const m = line.match(/^\s*2\s*\^\s*(\d+)\s*$/)
						if (!m) { outputs.push(''); errs.push('Expected format 2^<int>'); continue }
						const exp = BigInt(m[1])
						if (exp < 0 || exp > 256) { outputs.push(''); errs.push('Exponent must be between 0 and 256'); continue }
						const val = 1n << exp
						if (op === 'pow_to_decimal') { outputs.push(val.toString()); errs.push(null) }
						else if (op === 'pow_to_keys') { const B = 1000000000n; const T = 1000000000000n; const P = 1000000000000000n; const b = formatDiv(val, B, precision); const t = formatDiv(val, T, precision); const p = formatDiv(val, P, precision); outputs.push(`BKeys ${b} | TKeys ${t} | PKeys ${p}`); errs.push(null) }
						else { const K = 1000n; const M = 1000000n; const G = 1000000000n; const T = 1000000000000n; const P = 1000000000000000n; const E = 1000000000000000000n; const k = formatDiv(val, K, precision); const m2 = formatDiv(val, M, precision); const g = formatDiv(val, G, precision); const t2 = formatDiv(val, T, precision); const p2 = formatDiv(val, P, precision); const e = formatDiv(val, E, precision); outputs.push(`KKeys ${k} | MKeys ${m2} | GKeys ${g} | TKeys ${t2} | PKeys ${p2} | EKeys ${e}`); errs.push(null) }
					} else if (op === 'decimal_to_pow') {
						const s = line.replace(/[,,\s_]/g, '')
						if (!/^\d+$/.test(s)) { outputs.push(''); errs.push('Expected positive integer decimal'); continue }
						const n = BigInt(s)
						if (n <= 0n) { outputs.push(''); errs.push('Value must be > 0'); continue }
						const k = bitLength(n) - 1
						outputs.push(isPowerOfTwo(n) ? `2^${k}` : `≈ 2^${k}`)
						errs.push(null)
					}
				}
				setInput(outputs.join('\n'))
				const hasErr = errs.some(e => !!e)
				if (hasErr) { const messages = errs.map((e, i) => (e ? `Line ${i + 1}: ${e}` : null)).filter(Boolean).join('\n'); setError(messages) } else { setError(null) }
				return
			}
			const res = await fetch('/api/tool/operate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, input }) })
			const data = await res.json()
			if (!res.ok) { setError(data?.error || 'Failed to complete API operation') }
			else { const errs: (string | null)[] = data.errors || []; const hasErr = errs.some((e: string | null) => !!e); setInput((data.outputs || []).join('\n')); if (hasErr) { const messages = errs.map((e: string | null, i: number) => (e ? `Line ${i + 1}: ${e}` : null)).filter(Boolean).join('\n'); setError(messages) } else { setError(null) } }
		} catch (e) { console.error(e); setError('Network or unexpected error during operation.') } finally { setLoading(false) }
	}

	function OperationButton({ label, op, tip }: { label: string; op: string; tip: string }) {
		const isPrimaryOp = op.startsWith('pow_') || op === 'decimal_to_pow'
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant={isPrimaryOp ? 'default' : 'outline'} size="sm" onClick={() => runOp(op)} disabled={loading} className={`font-medium shadow-sm w-full justify-start text-left text-sm whitespace-nowrap overflow-hidden transition-colors duration-200 ${isPrimaryOp ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-300'}`}>
						{loading && op === 'current_op' ? <RotateCw className="w-4 h-4 mr-2 animate-spin" /> : null}
						{label}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top" align="center" className='bg-gray-900 border-gray-800 text-white'>
					{tip}
				</TooltipContent>
			</Tooltip>
		)
	}

	const clearInput = () => { setInput(''); setError(null) }
	const incrementPrecision = () => setPrecision(p => Math.min(10, p + 1))
	const decrementPrecision = () => setPrecision(p => Math.max(0, p - 1))

	return (
		<TooltipProvider delayDuration={200}>
			<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 py-12">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="mb-10 flex items-center gap-4 border-b border-gray-200 pb-4">
						<div className="p-3 bg-blue-100 rounded-full">
							<Calculator className="h-7 w-7 text-blue-600" />
						</div>
						<div>
							<div className="text-3xl font-bold text-gray-900">Crypto Calculator & Converter</div>
							<div className="text-lg text-gray-600">Convert keys, public keys, hashes, and encodings quickly.</div>
						</div>
					</div>
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
						<Card className="lg:col-span-2 bg-white border-gray-200 shadow-md min-h-[700px] flex flex-col">
							<CardHeader className="border-b pb-4">
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">Input / Output Area</CardTitle>
								<CardDescription className="text-gray-600">Enter multiple inputs separated by new lines. The result will overwrite the input text.</CardDescription>
							</CardHeader>
							<CardContent className="pt-6 flex flex-col flex-1">
								<textarea className="w-full border border-gray-300 rounded-lg px-4 py-4 text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono text-sm shadow-inner transition-shadow flex-1 min-h-[250px]" placeholder="Paste inputs, each on a new line (e.g., 2^250 or 0x1A2B...)" value={input} onChange={(e) => setInput(e.target.value)} disabled={loading} />
								<div className="flex justify-between items-center mt-4">
									<Button onClick={clearInput} variant="outline" className="bg-red-50 text-red-600 border-red-300 hover:bg-red-100 hover:text-red-700" disabled={loading}>Clear Input</Button>
									{error && (<Alert className="max-w-md bg-red-50 border-red-300 text-red-800"><AlertDescription className="whitespace-pre-wrap text-sm">{error}</AlertDescription></Alert>)}
								</div>
							</CardContent>
						</Card>
						<Card className="lg:col-span-1 bg-white border-gray-200 shadow-md">
							<CardHeader className="border-b pb-4">
								<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">Available Operations</CardTitle>
								<CardDescription className="text-gray-600">Select an operation to run on the input area.</CardDescription>
							</CardHeader>
							<CardContent className="pt-6">
								<div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
									<h4 className='text-gray-800 font-semibold mb-2'>Output Precision</h4>
									<div className="flex items-center gap-2">
										<Input type="number" className="w-24 h-9 bg-white text-center font-mono border-gray-300" value={precision} onChange={(e) => { const v = parseInt(e.target.value || '0', 10); const clamped = Math.max(0, Math.min(10, isNaN(v) ? 0 : v)); setPrecision(clamped) }} min={0} max={10} />
										<Button onClick={decrementPrecision} size="icon" disabled={precision <= 0} className='bg-blue-100 hover:bg-blue-200 text-blue-600 border border-blue-300'><Minus className='w-4 h-4' /></Button>
										<Button onClick={incrementPrecision} size="icon" disabled={precision >= 10} className='bg-blue-100 hover:bg-blue-200 text-blue-600 border border-blue-300'><Plus className='w-4 h-4' /></Button>
										<span className='text-sm text-gray-600'>decimals</span>
									</div>
								</div>
								<Accordion type="multiple" className="divide-y divide-gray-200">
									<AccordionItem value="keys" className='border-gray-200'>
										<AccordionTrigger className="text-gray-900 hover:no-underline"><span className="flex items-center gap-2 font-medium"><Key className="h-4 w-4 text-purple-600" /> Keys (Private)</span></AccordionTrigger>
										<AccordionContent className='pb-4'>
											<div className="flex flex-col gap-2">
												<OperationButton label="Priv → Pubc" op="priv_to_pubc" tip="Derives compressed public key from a 32-byte private key hex" />
												<OperationButton label="Priv → Pubu" op="priv_to_pubu" tip="Derives uncompressed public key from a 32-byte private key hex" />
												<OperationButton label="Priv → WIFc" op="priv_to_wifc" tip="Converts private key to compressed WIF" />
												<OperationButton label="Priv → WIFu" op="priv_to_wifu" tip="Converts private key to uncompressed WIF" />
												<OperationButton label="WIF → Priv" op="wif_to_priv" tip="Decodes WIF to 32-byte private key hex" />
												<OperationButton label="Priv → Addrc" op="priv_to_addrc" tip="Computes P2PKH address from compressed public key (mainnet)" />
												<OperationButton label="Priv → Addru" op="priv_to_addru" tip="Computes P2PKH address from uncompressed public key (mainnet)" />
											</div>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="public" className='border-gray-200'>
										<AccordionTrigger className="text-gray-900 hover:no-underline"><span className="flex items-center gap-2 font-medium"><Key className="h-4 w-4 text-purple-600" /> Public Key</span></AccordionTrigger>
										<AccordionContent className='pb-4'>
											<div className="flex flex-col gap-2">
												<OperationButton label="Pub → Pubc" op="pub_to_pubc" tip="Compresses an uncompressed public key (65 bytes)" />
												<OperationButton label="Pub → Pubu" op="pub_to_pubu" tip="Uncompresses a compressed public key (33 bytes)" />
												<OperationButton label="Pub → Addr" op="pub_to_addr" tip="Computes P2PKH address from given public key" />
												<OperationButton label="Pub → Addrc" op="pub_to_addrc" tip="Computes P2PKH address from compressed public key" />
											</div>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="hashes" className='border-gray-200'>
										<AccordionTrigger className="text-gray-900 hover:no-underline"><span className="flex items-center gap-2 font-medium"><Hash className="h-4 w-4 text-purple-600" /> Hashes</span></AccordionTrigger>
										<AccordionContent className='pb-4'>
											<div className="flex flex-col gap-2">
												<OperationButton label="SHA-256" op="sha256" tip="SHA-256 of input (hex treated as bytes; otherwise UTF-8)" />
												<OperationButton label="RIPEMD-160" op="ripemd160" tip="RIPEMD-160 of input (hex treated as bytes; otherwise UTF-8)" />
												<OperationButton label="Hash-160" op="hash160" tip="RIPEMD-160(SHA-256(input)) commonly used in P2PKH" />
												<OperationButton label="Keccak-256" op="keccak256" tip="Keccak/SHA3-256 of input (hex treated as bytes; otherwise UTF-8)" />
												<OperationButton label="Addr → Hash-160" op="addr_to_hash160" tip="Extracts Hash-160 from a Base58Check P2PKH address" />
											</div>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="base58" className='border-gray-200'>
										<AccordionTrigger className="text-gray-900 hover:no-underline"><span className="flex items-center gap-2 font-medium"><LinkIcon className="h-4 w-4 text-purple-600" /> Base58 / Base58Check</span></AccordionTrigger>
										<AccordionContent className='pb-4'>
											<div className="flex flex-col gap-2">
												<OperationButton label="Base58 Enc" op="base58_enc" tip="Encodes bytes to Base58" />
												<OperationButton label="Base58 Dec" op="base58_dec" tip="Decodes Base58 string to hex bytes" />
												<OperationButton label="Base58Check Enc" op="base58check_enc" tip="Encodes payload with version 0x00 and checksum" />
												<OperationButton label="Base58Check Dec" op="base58check_dec" tip="Decodes Base58Check and returns payload hex without version" />
											</div>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="encoding" className='border-gray-200'>
										<AccordionTrigger className="text-gray-900 hover:no-underline"><span className="flex items-center gap-2 font-medium"><Text className="h-4 w-4 text-purple-600" /> Encoding</span></AccordionTrigger>
										<AccordionContent className='pb-4'>
											<div className="flex flex-col gap-2">
												<OperationButton label="Dec → Hex" op="dec_to_hex" tip="Converts decimal integer to hex" />
												<OperationButton label="Hex → Dec" op="hex_to_dec" tip="Converts hex to decimal integer" />
												<OperationButton label="Bin → Hex" op="bin_to_hex" tip="Converts binary string to hex" />
												<OperationButton label="Hex → Bin" op="hex_to_bin" tip="Converts hex to binary string" />
												<OperationButton label="ASCII → Hex" op="ascii_to_hex" tip="UTF‑8 string to hex bytes" />
												<OperationButton label="Hex → ASCII" op="hex_to_ascii" tip="Hex bytes to UTF‑8 string" />
											</div>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="exponent" className='border-gray-200'>
										<AccordionTrigger className="text-gray-900 hover:no-underline"><span className="flex items-center gap-2 font-medium"><Sigma className="h-4 w-4 text-purple-600" /> Exponent / Keyspace</span></AccordionTrigger>
										<AccordionContent className='pb-4'>
											<div className="flex flex-col gap-2">
												<OperationButton label="2^x → Dec" op="pow_to_decimal" tip="Converts 2^n expression to decimal" />
												<OperationButton label="Dec → 2^x" op="decimal_to_pow" tip="Approximates decimal as power-of-two" />
												<OperationButton label="2^x → B/T/P Keys" op="pow_to_keys" tip="Converts 2^n to Billion/Trillion/Peta keys" />
												<OperationButton label="2^x → All Keys" op="pow_to_keys_all" tip="Converts 2^n to K/M/G/B/T/P/E keys" />
											</div>
										</AccordionContent>
									</AccordionItem>
								</Accordion>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</TooltipProvider>
	)
}
