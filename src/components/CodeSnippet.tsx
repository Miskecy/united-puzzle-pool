"use client"
import { useState, useCallback } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-python'
import { Copy, Check } from 'lucide-react'

export default function CodeSnippet({ code, lang = 'bash' }: { code: string, lang?: string }) {
	const [copied, setCopied] = useState(false)
	const highlighted = Prism.highlight(code, Prism.languages[lang] || Prism.languages.markup, lang)
	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(code)
			setCopied(true)
			setTimeout(() => setCopied(false), 1200)
		} catch { }
	}, [code])
	return (
		<div className="relative">
			<button
				onClick={copy}
				className="absolute top-3 right-3 p-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
				title="Copy to clipboard"
			>
				{copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
			</button>
			<pre className="bg-gray-800 text-gray-100 p-3 rounded-md border border-gray-700 overflow-x-auto whitespace-pre-wrap" tabIndex={0} suppressHydrationWarning={true}>
				<code className={`language-${lang}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
			</pre>
		</div>
	)
}
