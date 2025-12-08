'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// Componentes UI assumidos (Button, Link)
// Assumindo que você tem um Button simples, vou usar classes Tailwind/HTML para consistência de estilo de botão.
import { Code, Settings, Terminal, FileText, Github, Code2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import CodeSnippet from '@/components/CodeSnippet'

// Using shared CodeSnippet component for consistent blocks


// --- 2. COMPONENTE PRINCIPAL ---
export default function GPUScriptDocs() {
	const [scriptPyText, setScriptPyText] = useState<string>('');
	const [settingsJsonText, setSettingsJsonText] = useState<string>('');
	// Variáveis HTML/Highlighter removidas, o CodeBlock agora faz o highlight.


	// Load script files
	useEffect(() => {
		const load = async () => {
			try {
				// Simulação de Fetch (ajuste os caminhos reais se necessário)
				const [pyRes, jsonRes] = await Promise.all([
					fetch('/docs/gpu-script/script.py'),
					fetch('/docs/gpu-script/settings.json'),
				]);
				const py = await pyRes.text();
				const js = await jsonRes.text();

				setScriptPyText(py);
				setSettingsJsonText(js);
			} catch (e) {
				console.error("Failed to fetch script files:", e);
				setScriptPyText('Error loading script.py');
				setSettingsJsonText('Error loading settings.json');
			}
		};
		load();
	}, []);


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
						<CodeSnippet code={settingsJsonText} lang="json" />

						<p className="text-gray-700 text-sm mt-3">Set <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">vanitysearch_path</code> or <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">bitcrack_path</code> and tune arguments as needed. Toggle <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">auto_switch</code> to enable auto-selection. Use <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">post_block_delay_minutes</code> to control the delay before the next fetch.</p>
					</CardContent>
				</Card>

				{/* 3. Source Code Card (script.py) */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<FileText className="h-5 w-5 text-blue-600" />Source Code
						</CardTitle>
						<CardDescription className="text-gray-600">Full script for local use</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<CodeSnippet code={scriptPyText} lang="python" />

						<div className="mt-3 flex items-center gap-3">

							<a href="https://github.com/Miskecy/united-pool-gpu-script" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 font-medium">
								<Github className="h-4 w-4 mr-1" /> GitHub Repository
							</a>
						</div>
					</CardContent>
				</Card>

				{/* 4. Usage Card */}
				<Card className="mb-8 shadow-sm hover:shadow-md transition-shadow border-gray-200">
					<CardHeader className="border-b pb-4">
						<CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
							<Terminal className="h-5 w-5 text-blue-600" />Usage
						</CardTitle>
						<CardDescription className="text-gray-600">Run, edit config, and monitor</CardDescription>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-4">

							{/* Run the script */}
							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Run the script</h4>
								<CodeSnippet code={`python script.py`} lang="bash" />
							</div>

							{/* Edit settings at runtime */}
							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Edit settings at runtime</h4>
								<p className="text-gray-700 text-sm">Update <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">settings.json</code> while the script is running. Changes are applied automatically on the next loop iteration.</p>
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
									<Github className="h-4 w-4 mr-1" /> Official Repository
								</a>
							</div>

							{/* VanitySearch-V2 */}
							<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
								<h4 className="text-gray-900 font-semibold mb-2">Clone and build VanitySearch-V2 (keyspace support)</h4>
								<pre className="font-mono text-sm bg-gray-800 text-gray-100 p-3 rounded-md border border-gray-700 overflow-x-auto whitespace-pre-wrap">
									<code className="language-bash">{`git clone https://github.com/ilkerccom/VanitySearch-V2
cd VanitySearch-V2
# Windows: Install CUDA SDK and open VanitySearch.sln in Visual C++ 2017
# Linux: edit Makefile to set CUDA paths (e.g., CUDA=/usr/local/cuda-11.8, g++-9)
# Build:
make all`}</code>
								</pre>
								<p className="text-gray-700 text-sm mt-2">This variant supports <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">--keyspace</code> and multi-address scanning. Note: one GPU per instance; use separate instances for multi-GPU.</p>
								<a href="https://github.com/ilkerccom/VanitySearch-V2" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-600 hover:text-blue-600 mt-2 font-medium">
									<Github className="h-4 w-4 mr-1" /> VanitySearch-V2 Repository
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
									<Github className="h-4 w-4 mr-1" /> Official Repository
								</a>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
