'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Code, Settings, Terminal, FileText, Github, Code2Icon } from 'lucide-react';
import CodeSnippet from '@/components/CodeSnippet'

// Using shared CodeSnippet component for consistent blocks


// --- 2. COMPONENTE PRINCIPAL ---
export default function GPUScriptDocs() {
	const exampleSettingsJson = `{
	  "api_url": "http://localhost:3000/api/block",
	  "additional_addresses": ["YOUR_TARGET_ADDRESS"],
	  "user_token": "YOUR_POOL_TOKEN",
	  "worker_name": "your_worker_name",
	  "program_name": "VanitySearch | cuBitCrack | VanitySearch-V2",
	  "program_path": "./VanitySearch | ./cuBitCrack | ./VanitySearch-V2",
	  "program_arguments": "",
	  "block_length": "1T",
	  "oneshot": false,
	  "post_block_delay_enabled": false,
	  "post_block_delay_minutes": 1,
	  "telegram_share": false,
	  "telegram_accesstoken": "YOUR_TELEGRAM_BOT_TOKEN",
	  "telegram_chatid": "YOUR_CHAT_ID"
	}`;

	return (
		// PADRÃO 1: Fundo com degradê
		<div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
			{/* max-w ajustado para consistência */}
			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

				{/* Header (PADRÃO 2: Títulos, Ícones, Cores) */}
				<div className="text-center mb-12">
					<div className="flex justify-center mb-4">
						<div className="p-4 bg-blue-100 rounded-2xl">
							<Code2Icon className="w-12 h-12 text-blue-600" />
						</div>
					</div>
					{/* Cores de texto PADRÃO: gray-900 e gray-600 */}
					<h1 className="text-5xl font-bold text-gray-900 mb-4">GPU Script Guide</h1>
					<p className="text-lg text-gray-600 max-w-2xl mx-auto">Complete guide to use the personal GPU script with VanitySearch and BitCrack, including configuration, usage, and full source code.</p>
				</div>

				{/* 1. Overview Card (PADRÃO 3: Card com sombra) */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4"> {/* Ajuste de espaçamento PADRÃO */}
						{/* Ícone e Título com cor PADRÃO */}
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<Settings className="h-5 w-5 text-blue-600" />Overview
						</CardTitle>
						<CardDescription className="text-gray-600">What this script does and when to use each tool</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<ul className="text-gray-700 text-sm space-y-2 list-disc pl-5">
							<li>Fetches a block, writes addresses to <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">in.txt</code>, runs the selected tool with <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">--keyspace</code>, parses <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">out.txt</code>, and posts keys in batches of 10.</li>
							<li>Auto-selects <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">BitCrack</code> for blocks under <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">1T</code> on single GPU and <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">VanitySearch</code> otherwise. Multi-GPU forces <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">VanitySearch</code>.</li>
							<li>Reloads <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">settings.json</code> every iteration so you can edit while running. Supports configurable delay via <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">post_block_delay_enabled</code> and <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">post_block_delay_minutes</code> (default 10s).</li>
						</ul>
					</CardContent>
				</Card>

				{/* 2. Configuration Card (settings.json) */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<Code className="h-5 w-5 text-blue-600" />Configuration
						</CardTitle>
						<CardDescription className="text-gray-600">Adjust <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">settings.json</code> to match your environment</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<CodeSnippet code={exampleSettingsJson} lang="json" />

						<p className="text-gray-700 text-sm mt-3">Configure <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">api_url</code>, your <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">user_token</code>, and choose <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">program_name</code> with matching <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">program_path</code> and <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">program_arguments</code>. Use <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">post_block_delay_minutes</code> and Telegram fields if needed.</p>
					</CardContent>
				</Card>



				{/* 4. Usage Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<Terminal className="h-5 w-5 text-blue-600" />Usage
						</CardTitle>
						<CardDescription className="text-gray-600">Download, install, run, and edit config</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-4">
							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Download the script</h4>
								<CodeSnippet code={`git clone https://github.com/Miskecy/united-pool-gpu-script\ncd united-pool-gpu-script`} lang="bash" />
								<a href="https://github.com/Miskecy/united-pool-gpu-script" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 mt-2 font-medium">
									<Github className="h-4 w-4 mr-1" /> united-pool-gpu-script Repository
								</a>
							</div>

							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Install Python dependencies</h4>
								<CodeSnippet code={`python -m venv .venv\n.venv\\Scripts\\activate\npip install requests colorama`} lang="bash" />
								<p className="text-gray-700 text-sm mt-2">Create a virtual environment (optional) and install minimal dependencies required by the script.</p>
							</div>

							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Configure settings.json</h4>
								<p className="text-gray-700 text-sm">Create a <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">settings.json</code> file in the repository root using the template shown above. Set <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">api_url</code>, <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">user_token</code>, and program fields.</p>
							</div>

							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Run</h4>
								<CodeSnippet code={`python script.py`} lang="bash" />
								<p className="text-gray-700 text-sm mt-2">Edit <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">settings.json</code> while running; changes apply on the next loop.</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* 5. Tool Setup Card (Mantido o layout original, padronizando o estilo) */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<Code className="h-5 w-5 text-blue-600" />Tool Setup
						</CardTitle>
						<CardDescription className="text-gray-600">Get VanitySearch and BitCrack ready</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-4">

							{/* VanitySearch */}
							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Clone and build VanitySearch</h4>
								<pre className="font-mono text-sm bg-gray-800 text-gray-100 p-3 rounded-md border border-gray-700 overflow-x-auto whitespace-pre-wrap">
									<code className="language-bash">{`git clone https://github.com/JeanLucPons/VanitySearch
cd VanitySearch
# Windows: use Release build or prebuilt
# Linux: make (refer to repo instructions)`}</code>
								</pre>
								<a href="https://github.com/JeanLucPons/VanitySearch" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 mt-2 font-medium">
									<Github className="h-4 w-4 mr-1" /> VanitySearch Repository
								</a>
							</div>

							{/* VanitySearch-V3 */}
							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Clone and build VanitySearch-V3 (keyspace support)</h4>
								<pre className="font-mono text-sm bg-gray-800 text-gray-100 p-3 rounded-md border border-gray-700 overflow-x-auto whitespace-pre-wrap">
									<code className="language-bash">{`git clone https://github.com/Miskecy/VanitySearch-V3
cd VanitySearch-V3
# Windows: Install CUDA SDK and open VanitySearch.sln in Visual Studio
# Linux: edit Makefile to set CUDA paths (e.g., CUDA=/usr/local/cuda-11.8)
# Build:
make all`}</code>
								</pre>
								<p className="text-gray-700 text-sm mt-2">This variant supports <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">--keyspace</code> and multi-address scanning. Note: one GPU per instance; use separate instances for multi-GPU.</p>
								<a href="https://github.com/Miskecy/VanitySearch-V3" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 mt-2 font-medium">
									<Github className="h-4 w-4 mr-1" /> VanitySearch-V3 Repository
								</a>
							</div>

							{/* BitCrack */}
							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Clone and build BitCrack</h4>
								<pre className="font-mono text-sm bg-gray-800 text-gray-100 p-3 rounded-md border border-gray-700 overflow-x-auto whitespace-pre-wrap">
									<code className="language-bash">{`git clone https://github.com/brichard19/BitCrack
cd BitCrack
# Windows: open solution in Visual Studio, build cuKeyFinder for CUDA
# Linux: make BUILD_CUDA=1 (or BUILD_OPENCL=1)`}</code>
								</pre>
								<a href="https://github.com/brichard19/BitCrack" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 mt-2 font-medium">
									<Github className="h-4 w-4 mr-1" /> BitCrack Repository
								</a>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
