"use client"
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
// Ícones ajustados e mantidos
import { BookOpen, KeyRound, Server, Terminal, Github, Copy, Check, ShieldAlert, HelpCircle, GitCommit, GitBranch, Lightbulb, AlertTriangle } from 'lucide-react'
import { useEffect, useState, memo, useCallback, useMemo } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import Prism from 'prismjs';
// É recomendável importar os languages necessários. Exemplo:
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import CodeSnippet from '@/components/CodeSnippet'

// --- 1. COMPONENTE CodeBlock (MOVIDO PARA FORA) ---
// O memo é usado para evitar re-renderizações desnecessárias, já que as props são estáveis.
const CodeBlock = memo(({ id, lang = 'bash', plain }: { id: string, lang?: string, plain: Record<string, string> }) => {
	const [copiedId, setCopiedId] = useState<string | null>(null)
	const code = plain[id]
	const isCopied = copiedId === id

	// Adiciona uma chave única para forçar o React a re-renderizar o bloco quando o 'code' muda (de 'Loading' para o valor real)
	const key = code ? id : 'loading';

	const copy = useCallback(async () => {
		if (!code) return
		try {
			await navigator.clipboard.writeText(code)
			setCopiedId(id)
			setTimeout(() => setCopiedId(null), 1200)
		} catch { /* Ignora erros de clipboard */ }
	}, [code, id])

	// Lógica para highlighting (agora dentro de um useEffect interno)
	const highlightedCode = code ? Prism.highlight(code, Prism.languages[lang] || Prism.languages.markup, lang) : 'Loading...'

	return (
		<div className="relative" key={key}>
			<button
				onClick={copy}
				className="absolute top-3 right-3 p-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
				title="Copy to clipboard"
			>
				{isCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
			</button>

			<pre
				className="bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm border border-gray-700"
				tabIndex={0}
				suppressHydrationWarning={true}
			>
				<code
					className={`language-${lang}`}
					dangerouslySetInnerHTML={{ __html: highlightedCode }}
				/>
			</pre>
		</div>
	)
})
CodeBlock.displayName = 'CodeBlock';
// --- FIM DO COMPONENTE CodeBlock ---


// Using shared CodeSnippet component for consistent code block UI patterns

export default function DocsLandingPage() {


	// --- Definições do Código (Mantidas como variáveis simples) ---
	const baseUrl = (typeof window !== 'undefined' && window.location?.origin)
		? window.location.origin
		: (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') as string
	const curlGenToken = `curl -s -X POST \\
  -H "Content-Type: application/json" \\
  -d '{"bitcoinAddress":"YOUR_BTC_ADDRESS"}' \\
  ${baseUrl}/api/token/generate`

	const respGenToken = `{
  "token": "xxxxxxxxxxxxxxxx",
  "bitcoinAddress": "YOUR_BTC_ADDRESS",
  "createdAt": "2024-01-01T00:00:00.000Z"
}`

	const curlGetBlock = `curl -s \\
  -H "pool-token: YOUR_TOKEN" \\
  "${baseUrl}/api/block?length=1T"`

	const respGetBlock = `{
  "id": "ck_block_123",
  "status": 0,
  "range": { "start": "400000", "end": "410000" },
  "checkwork_addresses": ["1AAAA...", "1BBBB...", "1CCCC...", "..."],
  "expiresAt": "2024-01-01T12:00:00.000Z",
  "message": "New block assigned successfully"
}`

	const curlSubmitKeys = `curl -s -X POST \\
  -H "Content-Type: application/json" \\
  -H "pool-token: YOUR_TOKEN" \\
  -d '{"privateKeys":["0xaaaaaaaa...","0xbbbbbbbb..."],"blockId":"ck_block_123"}' \\
  ${baseUrl}/api/block/submit`

	const respSubmitKeys = `{
	  "success": true,
	  "blockId": "ck_block_123",
	  "creditsAwarded": 1000,
	  "addressMap": [{ "address": "1AAAA...", "privateKey": "0xaaaaaaaa...", "isValid": true }]
	}`

	const plain = useMemo(
		() => ({
			curlGenToken,
			respGenToken,
			curlGetBlock,
			respGetBlock,
			curlSubmitKeys,
			respSubmitKeys,
		}),
		[
			curlGenToken,
			respGenToken,
			curlGetBlock,
			respGetBlock,
			curlSubmitKeys,
			respSubmitKeys,
		]
	)

	// --- Inicialização dos Dados e do Prism ---

	// Roda o highlight após o componente ser montado e após os dados serem carregados/atualizados
	useEffect(() => {
		// O highlightAll é necessário se você não estiver rodando o highlight item por item
		// Já que o CodeBlock agora faz o highlight item por item, esta chamada é redundante,
		// mas pode ser útil se outros elementos <pre> existirem na página.
		Prism.highlightAll();
	}, [plain]); // Depende de 'plain' para garantir que os dados estejam lá.


	return (
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

				{/* Header (Mantido) */}
				<div className="text-center mb-12">
					<div className="flex justify-center mb-4">
						<div className="p-4 bg-blue-100 rounded-2xl">
							<BookOpen className="w-12 h-12 text-blue-600" />
						</div>
					</div>
					<h1 className="text-5xl font-bold text-gray-900 mb-4">API Documentation</h1>
					<p className="text-lg text-gray-600 max-w-2xl mx-auto">
						Complete guide to authenticate, assign work, submit results, and integrate tools.
					</p>
				</div>

				{/* 1. Quick Start Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<KeyRound className="h-5 w-5 text-green-600" />
							Quick Start Flow
						</CardTitle>
						<CardDescription className="text-gray-600">The 4-step process to start mining using the API.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">

						{/* NOTA DE DESTAQUE PARA OPÇÃO DE TOKEN */}
						<div className="mb-6 p-3 bg-green-50 rounded-lg border border-green-200 flex items-center gap-3">
							<Server className="h-5 w-5 text-green-600 shrink-0" />
							<p className="text-sm text-gray-700">
								<strong>Token Tip:</strong> Your unique <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">pool-token</code> can be generated either via the <strong>Dashboard</strong> or using the <strong>POST /api/token/generate</strong> endpoint.
							</p>
						</div>

						{/* GRID DE PASSOS */}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
							{[
								// Passo 1: Token (Descrição simplificada)
								{ step: 1, title: 'Get Pool Token', icon: <Server className="h-6 w-6 text-green-600" />, desc: 'Acquire your unique pool token via the Dashboard or the API endpoint.' },

								// Passo 2: Request Block (Mantido)
								{ step: 2, title: 'Request Block', icon: <GitCommit className="h-6 w-6 text-green-600" />, desc: 'Use GET /api/block to get a block range (length=1T default).' },

								// Passo 3: Run Tool (Mantido)
								{ step: 3, title: 'Run Tool', icon: <Terminal className="h-6 w-6 text-green-600" />, desc: 'Execute your GPU tool (VanitySearch, BitCrack) on the assigned range.' },

								// Passo 4: Submit Keys (Mantido)
								{ step: 4, title: 'Submit Keys', icon: <GitBranch className="h-6 w-6 text-green-600" />, desc: 'Use POST /api/block/submit to send any found private keys.' },
							].map((item) => (
								<div key={item.step} className="p-4 bg-blue-50 rounded-lg border border-blue-200 flex flex-col items-start space-y-2">
									<span className="text-sm font-semibold text-green-700">STEP {item.step}</span>
									<div className="p-2 bg-white rounded-lg">{item.icon}</div>
									<h4 className="font-bold text-gray-900 text-base">{item.title}</h4>
									<p className="text-sm text-gray-700">{item.desc}</p>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* 2. Authentication Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<Server className="h-5 w-5 text-blue-600" />
							Authentication & Token Generation
						</CardTitle>
						<CardDescription className="text-gray-600">Use the shared secret header on every request.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="bg-gray-50 rounded-lg p-5 border border-gray-200 space-y-4">
							<ul className="space-y-2 text-sm text-gray-700">
								<li className="flex items-start"><span className="text-blue-600 mr-2">•</span><span><strong>Required Header:</strong> Send <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">pool-token: YOUR_TOKEN</code> on every endpoint request.</span></li>
							</ul>

							<h4 className="font-semibold text-gray-900 mb-2 mt-4">Generate Token: POST /api/token/generate</h4>
							<CodeSnippet code={plain.curlGenToken} lang="bash" />

							<h5 className="font-semibold text-gray-900 mt-4 mb-2">Response Example</h5>
							<CodeSnippet code={plain.respGenToken} lang="json" />
						</div>
					</CardContent>
				</Card>

				{/* 3. GET /api/block Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<GitCommit className="h-5 w-5 text-rose-600" />
							GET /api/block
						</CardTitle>
						<CardDescription className="text-gray-600">Assign a new block of work using your token.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-6">
						<div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
							<h4 className="font-semibold text-gray-900 mb-3">Parameters</h4>
							<ul className="space-y-2 text-sm text-gray-700">
								<li className="flex items-start"><span className="text-rose-600 mr-2">•</span><span>Query: <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">length</code> (supports K/M/B/T; default 1T)</span></li>
								<li className="flex items-start"><span className="text-rose-600 mr-2">•</span><span>Returns: <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">id</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">range</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">checkwork_addresses[]</code>, <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">expiresAt</code></span></li>
							</ul>
						</div>

						<h4 className="font-semibold text-gray-900 mb-3">Example Request</h4>
						<CodeSnippet code={plain.curlGetBlock} lang="bash" />

						<h4 className="font-semibold text-gray-900 mb-3 mt-6">Response: New Block Assigned</h4>
						<CodeSnippet code={plain.respGetBlock} lang="json" />
					</CardContent>
				</Card>

				{/* 4. POST /api/block/submit Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<GitBranch className="h-5 w-5 text-purple-600" />
							POST /api/block/submit
						</CardTitle>
						<CardDescription className="text-gray-600">Submit private keys found for your active block.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-6">
						<div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
							<h4 className="font-semibold text-gray-900 mb-3">Request Body</h4>
							<ul className="space-y-2 text-sm text-gray-700">
								<li className="flex items-start"><span className="text-purple-600 mr-2">•</span><span><code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">privateKeys[]</code> hex strings (with or without 0x)</span></li>
								<li className="flex items-start"><span className="text-purple-600 mr-2">•</span><span><code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">blockId</code> optional; auto-detected from active block if omitted.</span></li>
							</ul>
						</div>

						<h4 className="font-semibold text-gray-900 mb-3">Example Request</h4>
						<CodeSnippet code={plain.curlSubmitKeys} lang="bash" />

						<h4 className="font-semibold text-gray-900 mb-3 mt-6">Response: OK</h4>
						<CodeSnippet code={plain.respSubmitKeys} lang="json" />
					</CardContent>
				</Card>

				{/* 5. Tools & Setup Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<Terminal className="h-5 w-5 text-blue-600" />
							Tools & Setup
						</CardTitle>
						<CardDescription className="text-gray-600">Recommended GPU mining tools for key finding.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<p className="text-sm text-gray-700 mb-6">
							After obtaining your block range (start and end addresses) from the <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">GET /api/block</code> endpoint, use one of the tools below to search for private keys within that range.
						</p>
						<ul className="space-y-8">
							{/* VanitySearch */}
							<li className="bg-gray-50 rounded-lg p-5 border border-gray-200">
								<div className="flex justify-between items-start">
									<h4 className="text-gray-900 font-bold mb-1">VanitySearch</h4>
									<a href={`https://github.com/JeanLucPons/VanitySearch`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 text-sm transition-colors">
										<Github className="h-4 w-4 mr-1" /> Repository
									</a>
								</div>
								<p className="text-sm text-gray-700 mb-3">Fast CUDA-accelerated search tool.</p>

								<h5 className="text-gray-900 font-semibold mb-2 text-sm">1. Installation</h5>
								<CodeSnippet code={`git clone https://github.com/JeanLucPons/VanitySearch\ncd VanitySearch\nmake`} />

								<h5 className="text-gray-900 font-semibold mb-2 text-sm">2. Usage Example</h5>
								<p className="text-sm text-gray-700 mb-2">Original VanitySearch focuses on vanity prefix search. For range scanning, use <span className="font-mono">VanitySearch-V2</span> or <span className="font-mono">BitCrack</span>.</p>
								<CodeSnippet code={`./VanitySearch -gpu 1MyPrefix`} />
							</li>

							{/* VanitySearch-V2 */}
							<li className="bg-gray-50 rounded-lg p-5 border border-gray-200">
								<div className="flex justify-between items-start">
									<h4 className="text-gray-900 font-bold mb-1">VanitySearch-V2</h4>
									<a href={`https://github.com/ilkerccom/VanitySearch-V2`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 text-sm transition-colors">
										<Github className="h-4 w-4 mr-1" /> Repository
									</a>
								</div>
								<p className="text-sm text-gray-700 mb-3">Optimized version for better performance.</p>

								<h5 className="text-gray-900 font-semibold mb-2 text-sm">1. Installation</h5>
								<CodeSnippet code={`git clone https://github.com/ilkerccom/VanitySearch-V2\ncd VanitySearch-V2\nmake all`} />

								<h5 className="text-gray-900 font-semibold mb-2 text-sm">2. Usage Example</h5>
								<p className="text-sm text-gray-700 mb-2">Use <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">--keyspace</code> with your assigned range and provide addresses via <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">in.txt</code>:</p>
								<CodeSnippet code={`./vanitysearch -gpu -i in.txt -o out.txt --keyspace [START_RANGE]:[END_RANGE]`} />
							</li>

							{/* BitCrack */}
							<li className="bg-gray-50 rounded-lg p-5 border border-gray-200">
								<div className="flex justify-between items-start">
									<h4 className="text-gray-900 font-bold mb-1">BitCrack</h4>
									<a href={`https://github.com/brichard19/BitCrack`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 text-sm transition-colors">
										<Github className="h-4 w-4 mr-1" /> Repository
									</a>
								</div>
								<p className="text-sm text-gray-700 mb-3">Multi-GPU, high-speed key search.</p>

								<h5 className="text-gray-900 font-semibold mb-2 text-sm">1. Installation</h5>
								<CodeSnippet code={`git clone https://github.com/brichard19/BitCrack\ncd BitCrack\nmake BUILD_CUDA=1`} />

								<h5 className="text-gray-900 font-semibold mb-2 text-sm">2. Usage Example</h5>
								<p className="text-sm text-gray-700 mb-2">Use <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">--keyspace</code> and load target addresses from a file with <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">-i</code>:</p>
								<CodeSnippet code={`# Create address.txt with the block's target address\n./cuBitCrack --keyspace [START_RANGE]:[END_RANGE] -i address.txt -o found.txt -c`} />
							</li>

							{/* KeyHunt (ATUALIZADO) */}
							<li className="bg-gray-50 rounded-lg p-5 border border-gray-200">
								<div className="flex justify-between items-start">
									<h4 className="text-gray-900 font-bold mb-1">KeyHunt</h4>
									{/* Link do repositório ATUALIZADO */}
									<a href={`https://github.com/albertobsd/keyhunt`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 text-sm transition-colors">
										<Github className="h-4 w-4 mr-1" /> Repository
									</a>
								</div>
								<p className="text-sm text-gray-700 mb-3">An ultra-fast key search tool that supports multiple search modes.</p>

								<h5 className="text-gray-900 font-semibold mb-2 text-sm">1. Installation</h5>
								<p className="text-sm text-gray-700 mb-2">Debian/Ubuntu example:</p>
								<CodeSnippet code={`git clone https://github.com/albertobsd/keyhunt\ncd keyhunt\nmake`} />

								<h5 className="text-gray-900 font-semibold mb-2 text-sm">2. Usage Example</h5>
								<p className="text-sm text-gray-700 mb-2">Use address mode with a target file and specify the range with <code className="px-1.5 py-0.5 bg-white rounded text-xs font-mono">-r</code>:</p>
								<CodeSnippet code={`# address.txt contains your block target address\n./keyhunt -m address -f address.txt -r [START_RANGE]:[END_RANGE] -l compress`} />
							</li>
						</ul>
					</CardContent>
				</Card>


				{/* 6. Security Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<ShieldAlert className="h-5 w-5 text-amber-600" />
							Security & Best Practices
						</CardTitle>
						<CardDescription className="text-gray-600">Handle tokens and private keys safely with effective strategies.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">

							{/* Coluna 1: Effective Strategies (Tips) */}
							<div className="bg-blue-50 rounded-lg p-5 border border-blue-200">
								<h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
									<Lightbulb className="w-5 h-5 text-blue-600" /> Effective Strategies
								</h4>
								<ul className="space-y-2 text-sm text-gray-700">
									<li className="flex items-start"><span className="text-blue-600 mr-2">•</span><span><strong>Use multiple GPUs</strong> if available for higher speed and efficiency.</span></li>
									<li className="flex items-start"><span className="text-blue-600 mr-2">•</span><span><strong>Configure ranges</strong> for better manageability and resource allocation.</span></li>
									<li className="flex items-start"><span className="text-blue-600 mr-2">•</span><span><strong>Monitor your progress</strong> frequently on the pool dashboard.</span></li>
									<li className="flex items-start"><span className="text-blue-600 mr-2">•</span><span><strong>Keep your software up to date</strong> to benefit from the latest optimizations.</span></li>
								</ul>
							</div>

							{/* Coluna 2: Important Cautions (Warnings) */}
							<div className="bg-amber-50 rounded-lg p-5 border border-amber-200">
								<h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
									<AlertTriangle className="w-5 h-5 text-amber-600" /> Important Cautions
								</h4>
								<ul className="space-y-2 text-sm text-gray-700">
									<li className="flex items-start"><span className="text-amber-600 mr-2">•</span><span><strong>Never share your private keys</strong> or solutions publicly.</span></li>
									<li className="flex items-start"><span className="text-amber-600 mr-2">•</span><span><strong>Always verify the puzzle address</strong> before starting any work.</span></li>
									<li className="flex items-start"><span className="text-amber-600 mr-2">•</span><span><strong>Respect block expiration times</strong> to avoid wasted work.</span></li>
									<li className="flex items-start"><span className="text-amber-600 mr-2">•</span><span><strong>Secure your <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">pool-token</code></strong> (Do not commit to GitHub).</span></li>
								</ul>
							</div>

						</div>
					</CardContent>
				</Card>

				{/* 7. FAQ Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<HelpCircle className="h-5 w-5 text-blue-600" />
							Frequently Asked Questions
						</CardTitle>
						<CardDescription className="text-gray-600">Detailed answers to common questions about the pool and API usage.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<Accordion type="single" collapsible className="w-full">

							{/* Question 1: What is the Bitcoin Puzzle? */}
							<AccordionItem value="puzzle" className="border-gray-200">
								<AccordionTrigger className="text-gray-900 hover:no-underline">What is the Bitcoin Puzzle?</AccordionTrigger>
								<AccordionContent className="text-gray-700">
									<p className="text-sm">The Bitcoin Puzzle is a cryptographic challenge aiming to discover the <strong>private key</strong> for a known Bitcoin address. Search space spans from 2¹ up to 2²⁵⁶, and pools distribute unexplored ranges for coordinated work.</p>
								</AccordionContent>
							</AccordionItem>

							{/* Question 2: How does the pool system work? */}
							<AccordionItem value="pool_system" className="border-gray-200">
								<AccordionTrigger className="text-gray-900 hover:no-underline">How does the pool system work?</AccordionTrigger>
								<AccordionContent className="text-gray-700">
									<p className="text-sm">The pool assigns <strong>key ranges</strong> to users via <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">GET /api/block</code>. Users run GPU software to search keys within that range. If a key is found, submit it using <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">POST /api/block/submit</code>; after validation, credits are awarded.</p>
								</AccordionContent>
							</AccordionItem>

							{/* Question 3: What software can I use? */}
							<AccordionItem value="software" className="border-gray-200">
								<AccordionTrigger className="text-gray-900 hover:no-underline">What software can I use?</AccordionTrigger>
								<AccordionContent className="text-gray-700">
									<p className="text-sm">You can use any GPU tool that supports private key range scanning. Common tools include <strong>VanitySearch</strong>, <strong>VanitySearch-V2</strong>, and <strong>BitCrack</strong>, detailed in the <strong>Tools & Setup</strong> section.</p>
								</AccordionContent>
							</AccordionItem>

							{/* Question 4: What can I do with credits? */}
							<AccordionItem value="credits" className="border-gray-200">
								<AccordionTrigger className="text-gray-900 hover:no-underline">What can I do with credits?</AccordionTrigger>
								<AccordionContent className="text-gray-700">
									<p className="text-sm">Credits are your reward for completed work. They determine your share of any Bitcoin recovered by the pool. You can check your balance and history on your account dashboard.</p>
								</AccordionContent>
							</AccordionItem>

							{/* Question 5: What happens if I find a solution? */}
							<AccordionItem value="solution" className="border-gray-200">
								<AccordionTrigger className="text-gray-900 hover:no-underline">What happens if I find a solution?</AccordionTrigger>
								<AccordionContent className="text-gray-700">
									<p className="text-sm">If you find a private key matching a target address in your block, <strong>do not share it</strong>. Use a safe redemption strategy (e.g., a coordinated sweep) to avoid on-chain exposure before funds are secured. Publicly exposing a key or announcing an address can lead to bots sweeping funds immediately.</p>
								</AccordionContent>
							</AccordionItem>

							{/* Question 6: What happens when my block expires? */}
							<AccordionItem value="expire" className="border-gray-200">
								<AccordionTrigger className="text-gray-900 hover:no-underline">What happens when my block expires?</AccordionTrigger>
								<AccordionContent className="text-gray-700">
									<p className="text-sm">If your work block expires (typically after <strong>12 hours</strong>), the range returns to the pool for reassignment. To get a new block, call <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">DELETE /api/block</code> to clear your active block, then request a new one with <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">GET /api/block</code>.</p>
								</AccordionContent>
							</AccordionItem>

						</Accordion>
					</CardContent>
				</Card>


				{/* 8. Related Docs Links */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
					<Card className="shadow-sm hover:shadow-md transition-shadow border-gray-200">
						<CardHeader>
							<CardTitle className="text-gray-900">GPU Script</CardTitle>
							<CardDescription className="text-gray-600">Guide and source code for the personal mining script</CardDescription>
						</CardHeader>
						<CardContent>
							<Link href="/docs/gpu-script" className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium">
								Open /docs/api/gpu-script
							</Link>
						</CardContent>
					</Card>
					<Card className="shadow-sm hover:shadow-md transition-shadow border-gray-200">
						<CardHeader>
							<CardTitle className="text-gray-900">Shared Pool API</CardTitle>
							<CardDescription className="text-gray-600">Interoperability endpoints for validated block ranges</CardDescription>
						</CardHeader>
						<CardContent>
							<Link href="/docs/shared" className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium">
								Open /docs/shared
							</Link>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
