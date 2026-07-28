'use client'

import Link from 'next/link'
import { Github, Bitcoin, Heart, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from '@/contexts/LanguageContext'

export default function Footer() {
	const donation = (process.env.NEXT_PUBLIC_DONATION_ADDRESS || '1DonateCoLNUhianPQH2rFe799LxrNZ3kp') as string
	const githubUrl = (process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/Miskecy/united-puzzle-pool') as string
	const [copied, setCopied] = useState(false)
	const { t } = useTranslation()

	async function copyDonation() {
		try {
			await navigator.clipboard.writeText(donation)
			setCopied(true)
			setTimeout(() => setCopied(false), 1200)
		} catch { }
	}

	return (
		<footer style={{ borderTop: '1px solid #262624', background: '#000000' }}>
			<div className="max-w-7xl mx-auto px-4 sm:px-7 py-10">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">

					{/* Open source */}
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: '#f4f3ee' }}>
							<Github className="h-4 w-4" style={{ color: '#9a9892' }} />
							{t('footer.openSource')}
						</div>
						<p className="text-[13px]" style={{ color: '#5c5a55' }}>
							{t('footer.contributions')}
						</p>
						<div className="flex gap-4">
							<Link
								href={githubUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[13px] font-medium inline-flex items-center gap-1 transition-colors duration-150"
								style={{ color: '#fc5c04' }}
								onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ff7226'}
								onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#fc5c04'}
							>
								<Github className="h-3.5 w-3.5" /> {t('footer.viewGithub')}
							</Link>
							<Link
								href="https://status.unitedpuzzlepool.com/status/united-puzzle-pool"
								target="_blank"
								rel="noopener noreferrer"
								className="text-[13px] font-medium inline-flex items-center gap-1 transition-colors duration-150"
								style={{ color: '#fc5c04' }}
								onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ff7226'}
								onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#fc5c04'}
							>
								<ExternalLink className="h-3.5 w-3.5" /> {t('footer.serviceStatus')}
							</Link>
						</div>

						<div className="pt-3" style={{ borderTop: '1px solid #262624' }}>
							<div className="text-[13px] font-semibold mb-1" style={{ color: '#f4f3ee' }}>{t('footer.inspiredBy')}</div>
							<div className="flex gap-4">
								<Link
									href="https://bitcoinpuzzles.io/"
									target="_blank"
									rel="noopener noreferrer"
									className="text-[13px] font-medium inline-flex items-center gap-1 transition-colors duration-150"
									style={{ color: '#9a9892' }}
									onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f4f3ee'}
									onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#9a9892'}
								>
									BitcoinPuzzles <ExternalLink className="h-3 w-3" />
								</Link>
								<Link
									href="https://btcpuzzle.info/"
									target="_blank"
									rel="noopener noreferrer"
									className="text-[13px] font-medium inline-flex items-center gap-1 transition-colors duration-150"
									style={{ color: '#9a9892' }}
									onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f4f3ee'}
									onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#9a9892'}
								>
									BTCPuzzle <ExternalLink className="h-3 w-3" />
								</Link>
							</div>
						</div>
					</div>

					{/* Donations */}
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: '#f4f3ee' }}>
							<Bitcoin className="h-4 w-4" style={{ color: '#fc5c04' }} />
							{t('footer.donations')}
						</div>
						<div
							className="flex items-center justify-between rounded-[10px] p-3 gap-2"
							style={{ background: '#191919', border: '1px solid #262624' }}
						>
							<code className="text-[11.5px] font-mono break-all flex-1 pr-2" style={{ color: '#9a9892' }}>
								{donation}
							</code>
							<button
								type="button"
								onClick={copyDonation}
								className="volt-btn-ghost shrink-0 text-[11.5px] px-3 py-1.5"
							>
								{copied ? t('common.copied') : t('common.copy')}
							</button>
						</div>
						<p className="text-[11.5px]" style={{ color: '#5c5a55' }}>
							{t('footer.donationsDesc')}
						</p>
					</div>

					{/* Greetings */}
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: '#f4f3ee' }}>
							<Heart className="h-4 w-4" style={{ color: '#f0554a' }} />
							{t('footer.about')}
						</div>
						<p className="text-[13px] leading-relaxed" style={{ color: '#9a9892' }}>
							{t('footer.aboutDesc')}
						</p>
						<p className="text-[11.5px]" style={{ color: '#5c5a55' }}>
							{t('footer.license')}
						</p>
					</div>
				</div>

				<div className="mt-10 text-center text-[11.5px]" style={{ color: '#5c5a55', borderTop: '1px solid #262624', paddingTop: '24px' }}>
					© {new Date().getFullYear()} {t('footer.copyright')}
				</div>
			</div>
		</footer>
	)
}
