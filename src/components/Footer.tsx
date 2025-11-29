'use client'

import Link from 'next/link'
import { Github, Bitcoin, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

export default function Footer() {
	const donation = (process.env.NEXT_PUBLIC_DONATION_ADDRESS || '1DonateCoLNUhianPQH2rFe799LxrNZ3kp') as string
	const githubUrl = (process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/UnitedPuzzlePool') as string
	const [copied, setCopied] = useState(false)

	async function copyDonation() {
		try {
			await navigator.clipboard.writeText(donation)
			setCopied(true)
			setTimeout(() => setCopied(false), 1200)
		} catch { }
	}

	return (
		<footer className="border-t border-gray-200 bg-white">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
					<div className="space-y-2">
						<div className="flex items-center gap-2 text-gray-900 font-semibold">
							<Github className="h-5 w-5" />
							<span>Open Source — United Puzzle Pool</span>
						</div>
						<p className="text-sm text-gray-600">Contributions welcome. Star the project and build together.</p>
						<Link href={githubUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1">
							<span>View on GitHub</span>
							<Github className="h-4 w-4" />
						</Link>
					</div>

					<div className="space-y-2">
						<div className="flex items-center gap-2 text-gray-900 font-semibold">
							<Bitcoin className="h-5 w-5 text-orange-600" />
							<span>Donations</span>
						</div>
						<div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
							<code className="text-xs sm:text-sm font-mono text-gray-800 break-all pr-3">{donation}</code>
							<Button size="sm" variant="ghost" onClick={copyDonation} className="shrink-0 text-xs">
								{copied ? 'Copied' : 'Copy'}
							</Button>
						</div>
						<p className="text-xs text-gray-600">Thank you for supporting this community effort.</p>
					</div>

					<div className="space-y-2">
						<div className="flex items-center gap-2 text-gray-900 font-semibold">
							<Heart className="h-5 w-5 text-pink-600" />
							<span>Greetings</span>
						</div>
						<p className="text-sm text-gray-700">I’m not a developer — I lay bricks for a living. I’m just an enthusiast who loves Bitcoin tech. By day I stack bricks, by night I try to stack sats. If the code looks wonky, at least the wall is straight.</p>
						<p className="text-xs text-gray-600">Licensed for any use. See the repository license.</p>
					</div>
				</div>

				<div className="mt-8 text-center text-xs text-gray-500">
					© {new Date().getFullYear()} United Puzzle Pool — Free for everyone to clone and use.
				</div>
			</div>
		</footer>
	)
}
