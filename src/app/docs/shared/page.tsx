"use client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, ShieldCheck, Server, GitBranch, KeyRound, Copy, Check, GitCommit } from 'lucide-react'
import { useState, useEffect } from 'react'
import CodeSnippet from '@/components/CodeSnippet'

export default function SharedDocsPage() {
	const [puzzleaddr, setPuzzleaddr] = useState('')
	const [genToken, setGenToken] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [copiedToken, setCopiedToken] = useState(false)
	const [genError, setGenError] = useState('')
	const [loadedFromStorage, setLoadedFromStorage] = useState(false)
	const [sharedEnabled, setSharedEnabled] = useState(false)
	const [sharedLoading, setSharedLoading] = useState(true)
	// removed copiedCurl state in favor of unified Snippet copy logic

	const curlGetDisplay = `curl -s \\
  -H "shared-pool-token: YOUR_TOKEN" \\
  "http://localhost:3000/api/shared?start=0x400000&end=0x410000"`

	const curlPostDisplay = `curl -s -X POST \\
  -H "Content-Type: application/json" \\
  -H "shared-pool-token: YOUR_TOKEN" \\
  -d '{
  "startRange": "0x400000",
  "endRange": "0x410000",
  "checkworks_addresses": ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"],
  "privatekeys": ["aabbcc..."],
  "puzzleaddress": "1BitcoinPuzzleAddress"
}' \\
  http://localhost:3000/api/shared`

	const respValidated = `{
  "status": "VALIDATED",
  "checkwork_addresses": ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"],
  "privatekeys": ["aabbcc...", "ddeeff..."],
  "blockId": "ck_123"
}`

	const respPartial = `{
  "status": "PARTIAL",
  "coverage_percent": 37.5,
  "segments": [
    { "start": "0x40010000", "end": "0x4001ffff" },
    { "start": "0x40030000", "end": "0x40037fff" }
  ],
  "checkwork_addresses": ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"],
  "privatekeys": ["aabbcc..."],
  "blockIds": ["ck_101", "ck_102"]
}`

	const respNotFound = `{
  "status": "NOT_FOUND",
  "checkwork_addresses": [],
  "privatekeys": []
}`

	useEffect(() => {
		try {
			const t = localStorage.getItem('shared-pool-token')
			if (t) { setGenToken(t); setLoadedFromStorage(true) }
		} catch { }
	}, [])

	useEffect(() => {
		(async () => {
			try {
				setSharedLoading(true)
				const rr = await fetch('/api/app/config')
				if (rr.ok) { const jj = await rr.json(); setSharedEnabled(!!jj?.shared_pool_api_enabled) }
			} catch { }
			finally { setSharedLoading(false) }
		})()
	}, [])

	async function generateToken() {
		try {
			setLoading(true)
			setGenToken(null)
			setGenError('')
			const res = await fetch('/api/shared/token/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ puzzleaddress: puzzleaddr || undefined })
			})
			const data = await res.json()
			if (!res.ok) {
				setGenToken(null)
				setGenError(String(data?.error || 'Failed to generate token'))
			} else {
				const t = String(data?.token || '')
				setGenToken(t)
				try { localStorage.setItem('shared-pool-token', t) } catch { }
				setLoadedFromStorage(false)
			}
		} catch {
			setGenToken(null)
			setGenError('Failed to generate token')
		} finally {
			setLoading(false)
		}
	}

	async function copyToken() {
		if (!genToken) return
		try {
			await navigator.clipboard.writeText(genToken)
			setCopiedToken(true)
			setTimeout(() => setCopiedToken(false), 1200)
		} catch { }
	}

	function clearStoredToken() {
		try { localStorage.removeItem('shared-pool-token') } catch { }
		setGenToken(null)
		setGenError('')
		setLoadedFromStorage(false)
	}

	// Using shared CodeSnippet for code blocks

	// Using Snippet for code blocks to keep a consistent UI pattern with /docs/api

	return (
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

				{/* Header */}
				<div className="text-center mb-12">
					<div className="flex justify-center mb-4">
						<div className="p-4 bg-blue-100 rounded-2xl">
							<BookOpen className="w-12 h-12 text-blue-600" />
						</div>
					</div>
					<h1 className="text-5xl font-bold text-gray-900 mb-4">Shared Pool API</h1>
					<p className="text-lg text-gray-600 max-w-2xl mx-auto">
						Endpoints for interoperable pools to query validation status and submit validated blocks securely.
					</p>
					<div className="mt-3 flex justify-center">
						{sharedLoading ? (
							<div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
						) : (
							<Badge className={`font-semibold ${sharedEnabled ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`}>
								{sharedEnabled ? 'Shared API: Enabled' : 'Shared API: Disabled'}
							</Badge>
						)}
					</div>
					<div className="mt-3 max-w-2xl mx-auto">
						<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
							<span className="font-semibold">Beta:</span> This tool is in active development and may have some issues.
						</div>
					</div>
				</div>

				{/* Authentication Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<Server className="h-5 w-5 text-blue-600" />
							Authentication
						</CardTitle>
						<CardDescription className="text-gray-600">Use the shared secret header on every request</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
							<p className="text-gray-700 mb-4 leading-relaxed">
								Send <code className="px-2 py-1 bg-white rounded border text-sm font-mono text-blue-600">shared-pool-token: YOUR_TOKEN</code> or{' '}
								<code className="px-2 py-1 bg-white rounded border text-sm font-mono text-blue-600">x-shared-secret: YOUR_SHARED_SECRET</code> on requests.
							</p>
							<CodeSnippet code={curlGetDisplay} />
						</div>
					</CardContent>
				</Card>

				{/* Quick Start Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="border-b">
						<CardTitle className="text-gray-900 flex items-center gap-2">
							<KeyRound className="h-5 w-5 text-green-600" />
							Quick Start
						</CardTitle>
						<CardDescription>Generate a Shared Pool token (puzzle address required)</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						{loadedFromStorage && genToken && (
							<div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 flex items-center justify-between gap-3">
								<p className="text-sm text-gray-700">A shared pool token is already saved in your browser storage.</p>
								<button type="button" onClick={clearStoredToken} className="text-yellow-700 hover:text-yellow-800 text-sm inline-flex items-center gap-1 font-medium">Clear Token</button>
							</div>
						)}
						<div className="flex flex-col sm:flex-row gap-3 mb-4">
							<input
								value={puzzleaddr}
								onChange={(e) => setPuzzleaddr(e.target.value)}
								placeholder="Puzzle address (required)"
								className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
							/>
							<button
								onClick={generateToken}
								disabled={loading || !puzzleaddr}
								className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${loading || !puzzleaddr
									? 'bg-gray-300 text-gray-500 cursor-not-allowed'
									: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
									}`}
							>
								{loading ? 'Generating...' : 'Generate Token'}
							</button>
						</div>
						{genToken && (
							<div className="flex items-center justify-between bg-linear-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-4 py-3">
								<code className="text-gray-800 text-sm break-all font-mono flex-1 mr-3">{genToken}</code>
								<button
									type="button"
									onClick={copyToken}
									className="text-green-700 hover:text-green-800 text-sm inline-flex items-center gap-1.5 font-medium whitespace-nowrap"
								>
									{copiedToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
									<span>{copiedToken ? 'Copied!' : 'Copy'}</span>
								</button>
							</div>
						)}
						{genError && (
							<div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mt-3">
								<p className="text-sm text-red-700">{genError}</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Check Range Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="border-b flex">
						<GitCommit className="h-5 w-5 text-rose-600" />
						<CardTitle className="text-gray-900">GET /api/shared</CardTitle>
						<CardDescription>Verify if a specific range is validated on our database</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-6">
						<div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
							<h4 className="font-semibold text-gray-900 mb-3">Parameters</h4>
							<ul className="space-y-2 text-sm text-gray-700">
								<li className="flex items-start">
									<span className="text-blue-600 mr-2">•</span>
									<span>Query params: <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">start</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">end</code> (hex, with or without 0x)</span>
								</li>
								<li className="flex items-start">
									<span className="text-blue-600 mr-2">•</span>
									<span>Returns: <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">status</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">checkwork_addresses</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">privatekeys</code></span>
								</li>
								<li className="flex items-start">
									<span className="text-blue-600 mr-2">•</span>
									<span>Status values: <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">VALIDATED</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">PARTIAL</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">ACTIVE</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">NOT_FOUND</code></span>
								</li>
							</ul>
						</div>

						<div>
							<h4 className="font-semibold text-gray-900 mb-3">Example Request</h4>
							<CodeSnippet code={curlGetDisplay} />
						</div>

						<div>
							<h4 className="font-semibold text-gray-900 mb-3">Response: VALIDATED</h4>
							<CodeSnippet code={respValidated} lang="json" />
						</div>

						<div>
							<h4 className="font-semibold text-gray-900 mb-3">Response: PARTIAL</h4>
							<CodeSnippet code={respPartial} lang="json" />
						</div>

						<div>
							<h4 className="font-semibold text-gray-900 mb-3">Response: NOT_FOUND</h4>
							<CodeSnippet code={respNotFound} lang="json" />
						</div>
					</CardContent>
				</Card>

				{/* Partial Coverage Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="border-b">
						<CardTitle className="text-gray-900">Partial Coverage</CardTitle>
						<CardDescription>When only part of the requested range is validated</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<ul className="space-y-2 text-sm text-gray-700">
							<li className="flex items-start">
								<span className="text-blue-600 mr-2">•</span>
								<span><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">coverage_percent</code> calculates merged overlap length over requested range</span>
							</li>
							<li className="flex items-start">
								<span className="text-blue-600 mr-2">•</span>
								<span><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">segments[]</code> contains normalized hex bounds for each merged overlap</span>
							</li>
							<li className="flex items-start">
								<span className="text-blue-600 mr-2">•</span>
								<span><code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">checkwork_addresses</code> and <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">privatekeys</code> are aggregated</span>
							</li>
						</ul>
					</CardContent>
				</Card>

				{/* Submit Block Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="border-b">
						<CardTitle className="text-gray-900 flex items-center gap-2">
							<GitBranch className="h-5 w-5 text-purple-600" />
							POST /api/shared
						</CardTitle>
						<CardDescription>Send validated block data from another pool</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-6">
						<div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
							<h4 className="font-semibold text-gray-900 mb-3">Request Body</h4>
							<ul className="space-y-2 text-sm text-gray-700">
								<li className="flex items-start">
									<span className="text-purple-600 mr-2">•</span>
									<span>Body: <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">startRange</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">endRange</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">checkworks_addresses[]</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">privatekeys[]</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">puzzleaddress</code></span>
								</li>
								<li className="flex items-start">
									<span className="text-purple-600 mr-2">•</span>
									<span>Safety: data validated and stored into <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">block_assignments</code> and <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">block_solutions</code></span>
								</li>
								<li className="flex items-start">
									<span className="text-purple-600 mr-2">•</span>
									<span><code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">user_token_id</code> is linked to a synthetic shared user for the pool</span>
								</li>
							</ul>
						</div>

						<div>
							<h4 className="font-semibold text-gray-900 mb-3">Example Request</h4>
							<CodeSnippet code={curlPostDisplay} />
						</div>

						<div>
							<h4 className="font-semibold text-gray-900 mb-3">Response: OK</h4>
							<CodeSnippet code={respValidated} lang="json" />
						</div>
					</CardContent>
				</Card>

				{/* Security Card */}
				<Card className="shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="border-b ">
						<CardTitle className="text-gray-900 flex items-center gap-2">
							<ShieldCheck className="h-5 w-5 text-amber-600" />
							Security & Limits
						</CardTitle>
						<CardDescription>Protected by shared secret and rate limiting</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<ul className="space-y-2 text-sm text-gray-700">
							<li className="flex items-start">
								<span className="text-amber-600 mr-2">•</span>
								<span>This route requires <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">x-shared-secret</code> matching <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">SHARED_POOL_SECRET</code></span>
							</li>
							<li className="flex items-start">
								<span className="text-amber-600 mr-2">•</span>
								<span>Requests are rate-limited using pool-wide middleware</span>
							</li>
							<li className="flex items-start">
								<span className="text-amber-600 mr-2">•</span>
								<span>Hex ranges are normalized and validated before persistence</span>
							</li>
						</ul>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
