'use client'

import Link from 'next/link'
import { BookOpen, KeyRound, Server, Terminal, Github, ShieldAlert, HelpCircle, GitCommit, GitBranch, Lightbulb, AlertTriangle, ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import CodeSnippet from '@/components/CodeSnippet'
import { useTranslation } from '@/contexts/LanguageContext'

const ic = (text: string) => (
	<code className="font-mono text-[11.5px] px-1.5 py-0.5 rounded" style={{ background: '#191919', color: '#fc5c04', border: '1px solid #262624' }}>{text}</code>
)

const SectionCard = ({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) => (
	<div className="volt-card">
		<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
			<div className="flex items-center gap-2">
				{icon}
				<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{title}</span>
			</div>
			{desc && <p className="text-[12.5px] mt-1" style={{ color: '#5c5a55' }}>{desc}</p>}
		</div>
		<div className="px-6 py-5">{children}</div>
	</div>
)

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
	const [open, setOpen] = useState(false)
	return (
		<div style={{ borderBottom: '1px solid #262624' }}>
			<button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between py-4 text-left text-[13.5px] font-semibold" style={{ color: '#f4f3ee' }}>
				{q}
				<ChevronDown className="h-4 w-4 shrink-0 transition-transform" style={{ color: '#9a9892', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
			</button>
			{open && <div className="pb-4 text-[13px]" style={{ color: '#9a9892' }}>{children}</div>}
		</div>
	)
}

export default function DocsLandingPage() {
	const { t } = useTranslation()
	const baseUrl = typeof window !== 'undefined' && window.location?.origin
		? window.location.origin
		: (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')

	const plain = useMemo(() => ({
		curlGenToken: `curl -s -X POST \\\n  -H "Content-Type: application/json" \\\n  -d '{"bitcoinAddress":"YOUR_BTC_ADDRESS"}' \\\n  ${baseUrl}/api/token/generate`,
		respGenToken: `{\n  "token": "xxxxxxxxxxxxxxxx",\n  "bitcoinAddress": "YOUR_BTC_ADDRESS",\n  "createdAt": "2024-01-01T00:00:00.000Z"\n}`,
		curlGetBlock: `curl -s \\\n  -H "pool-token: YOUR_TOKEN" \\\n  "${baseUrl}/api/block?length=1T"`,
		respGetBlock: `{\n  "id": "ck_block_123",\n  "status": 0,\n  "range": { "start": "400000", "end": "410000" },\n  "checkwork_addresses": ["1AAAA...", "1BBBB...", "1CCCC..."],\n  "expiresAt": "2024-01-01T12:00:00.000Z",\n  "message": "New block assigned successfully"\n}`,
		curlSubmitKeys: `curl -s -X POST \\\n  -H "Content-Type: application/json" \\\n  -H "pool-token: YOUR_TOKEN" \\\n  -d '{"privateKeys":["0xaaaaaaaa...","0xbbbbbbbb..."],"blockId":"ck_block_123"}' \\\n  ${baseUrl}/api/block/submit`,
		respSubmitKeys: `{\n  "success": true,\n  "blockId": "ck_block_123",\n  "creditsAwarded": 1000,\n  "addressMap": [{ "address": "1AAAA...", "privateKey": "0xaaaaaaaa...", "isValid": true }]\n}`,
	}), [baseUrl])

	const steps = [
		{ step: 1, icon: <Server className="h-5 w-5" style={{ color: '#fc5c04' }} />, titleKey: 'apiDocs.quickStart.step1Title', descKey: 'apiDocs.quickStart.step1Desc' },
		{ step: 2, icon: <GitCommit className="h-5 w-5" style={{ color: '#fc5c04' }} />, titleKey: 'apiDocs.quickStart.step2Title', descKey: 'apiDocs.quickStart.step2Desc' },
		{ step: 3, icon: <Terminal className="h-5 w-5" style={{ color: '#fc5c04' }} />, titleKey: 'apiDocs.quickStart.step3Title', descKey: 'apiDocs.quickStart.step3Desc' },
		{ step: 4, icon: <GitBranch className="h-5 w-5" style={{ color: '#fc5c04' }} />, titleKey: 'apiDocs.quickStart.step4Title', descKey: 'apiDocs.quickStart.step4Desc' },
	]

	const tools = [
		{
			name: 'VanitySearch', href: 'https://github.com/JeanLucPons/VanitySearch',
			desc: 'Fast CUDA-accelerated search tool.',
			install: 'git clone https://github.com/JeanLucPons/VanitySearch\ncd VanitySearch\nmake',
			usage: './VanitySearch -gpu 1MyPrefix',
			usageNoteKey: 'apiDocs.tools.vanitySearchNote',
		},
		{
			name: 'VanitySearch-V3', href: 'https://github.com/Miskecy/VanitySearch-V3',
			desc: 'Optimized version with keyspace support.',
			install: 'git clone https://github.com/Miskecy/VanitySearch-V3\ncd VanitySearch-V3\nmake all',
			usage: './vanitysearch86-v3 -gpu -i in.txt -o out.txt --keyspace [START_RANGE]:[END_RANGE]',
		},
		{
			name: 'BitCrack', href: 'https://github.com/brichard19/BitCrack',
			desc: 'Multi-GPU, high-speed key search.',
			install: 'git clone https://github.com/brichard19/BitCrack\ncd BitCrack\nmake BUILD_CUDA=1',
			usage: '# Create address.txt with the block\'s target address\n./cuBitCrack --keyspace [START_RANGE]:[END_RANGE] -i address.txt -o found.txt -c',
		},
		{
			name: 'KeyHunt', href: 'https://github.com/albertobsd/keyhunt',
			desc: 'An ultra-fast key search tool with multiple search modes.',
			install: 'git clone https://github.com/albertobsd/keyhunt\ncd keyhunt\nmake',
			usage: '# address.txt contains your block target address\n./keyhunt -m address -f address.txt -r [START_RANGE]:[END_RANGE] -l compress',
		},
	]

	const strategyKeys = ['apiDocs.security.strategy1', 'apiDocs.security.strategy2', 'apiDocs.security.strategy3', 'apiDocs.security.strategy4']
	const cautionKeys = ['apiDocs.security.caution1', 'apiDocs.security.caution2', 'apiDocs.security.caution3', 'apiDocs.security.caution4']

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
			<div className="max-w-5xl mx-auto px-4 sm:px-7 py-12 space-y-6">

				{/* Header */}
				<div className="text-center space-y-4 mb-8">
					<div className="flex justify-center">
						<div className="p-4 rounded-2xl" style={{ background: 'rgba(252,92,4,0.1)' }}>
							<BookOpen className="w-12 h-12" style={{ color: '#fc5c04' }} />
						</div>
					</div>
					<h1 className="text-[40px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('apiDocs.title')}</h1>
					<p className="text-[15px] max-w-2xl mx-auto" style={{ color: '#9a9892' }}>
						{t('apiDocs.subtitle')}
					</p>
				</div>

				{/* Quick Start */}
				<SectionCard icon={<KeyRound className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('apiDocs.quickStart.title')} desc={t('apiDocs.quickStart.desc')}>
					<div className="mb-5 flex items-start gap-3 p-3 rounded-[10px]" style={{ background: 'rgba(61,220,132,0.06)', border: '1px solid rgba(61,220,132,0.2)' }}>
						<Server className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#3ddc84' }} />
						<p className="text-[13px]" style={{ color: '#9a9892' }}>
							<strong style={{ color: '#f4f3ee' }}>{t('apiDocs.tokenTip')}</strong> Your unique {ic('pool-token')} can be generated via the <strong style={{ color: '#f4f3ee' }}>Dashboard</strong> or using the <strong style={{ color: '#f4f3ee' }}>POST /api/token/generate</strong> endpoint.
						</p>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
						{steps.map(s => (
							<div key={s.step} className="rounded-[10px] p-4 flex flex-col gap-2" style={{ background: '#131313', border: '1px solid #262624' }}>
								<span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#fc5c04' }}>{t('apiDocs.step')} {s.step}</span>
								<div className="p-2 rounded-lg w-fit" style={{ background: '#191919' }}>{s.icon}</div>
								<h4 className="text-[13px] font-bold" style={{ color: '#f4f3ee' }}>{t(s.titleKey)}</h4>
								<p className="text-[12px]" style={{ color: '#9a9892' }}>{t(s.descKey)}</p>
							</div>
						))}
					</div>
				</SectionCard>

				{/* Authentication */}
				<SectionCard icon={<Server className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('apiDocs.auth.title')} desc={t('apiDocs.auth.desc')}>
					<div className="rounded-[10px] p-5 space-y-4" style={{ background: '#131313', border: '1px solid #262624' }}>
						<ul className="space-y-2 text-[13px]" style={{ color: '#9a9892' }}>
							<li className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span><strong style={{ color: '#f4f3ee' }}>{t('apiDocs.auth.requiredHeader')}</strong> Send {ic('pool-token: YOUR_TOKEN')} on every endpoint request.</span></li>
						</ul>
						<div>
							<h4 className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>{t('apiDocs.auth.generateTitle')}</h4>
							<CodeSnippet code={plain.curlGenToken} lang="bash" />
						</div>
						<div>
							<h4 className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>{t('apiDocs.auth.responseTitle')}</h4>
							<CodeSnippet code={plain.respGenToken} lang="json" />
						</div>
					</div>
				</SectionCard>

				{/* GET /api/block */}
				<SectionCard icon={<GitCommit className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('apiDocs.getBlock.title')} desc={t('apiDocs.getBlock.desc')}>
					<div className="rounded-[10px] p-5 space-y-4" style={{ background: '#131313', border: '1px solid #262624' }}>
						<div>
							<h4 className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>{t('apiDocs.getBlock.parametersTitle')}</h4>
							<ul className="space-y-1.5 text-[13px]" style={{ color: '#9a9892' }}>
								<li className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span>Query: {ic('length')} (supports K/M/B/T; default 1T)</span></li>
								<li className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span>Returns: {ic('id')}, {ic('range')}, {ic('checkwork_addresses[]')}, {ic('expiresAt')}</span></li>
							</ul>
						</div>
						<div>
							<h4 className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>{t('apiDocs.getBlock.exampleTitle')}</h4>
							<CodeSnippet code={plain.curlGetBlock} lang="bash" />
						</div>
						<div>
							<h4 className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>{t('apiDocs.getBlock.responseTitle')}</h4>
							<CodeSnippet code={plain.respGetBlock} lang="json" />
						</div>
					</div>
				</SectionCard>

				{/* POST /api/block/submit */}
				<SectionCard icon={<GitBranch className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('apiDocs.submitBlock.title')} desc={t('apiDocs.submitBlock.desc')}>
					<div className="rounded-[10px] p-5 space-y-4" style={{ background: '#131313', border: '1px solid #262624' }}>
						<div>
							<h4 className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>{t('apiDocs.submitBlock.bodyTitle')}</h4>
							<ul className="space-y-1.5 text-[13px]" style={{ color: '#9a9892' }}>
								<li className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span>{ic('privateKeys[]')} hex strings (with or without 0x)</span></li>
								<li className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span>{ic('blockId')} optional; auto-detected from active block if omitted.</span></li>
							</ul>
						</div>
						<div>
							<h4 className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>{t('apiDocs.submitBlock.exampleTitle')}</h4>
							<CodeSnippet code={plain.curlSubmitKeys} lang="bash" />
						</div>
						<div>
							<h4 className="text-[13px] font-semibold mb-2" style={{ color: '#f4f3ee' }}>{t('apiDocs.submitBlock.responseTitle')}</h4>
							<CodeSnippet code={plain.respSubmitKeys} lang="json" />
						</div>
					</div>
				</SectionCard>

				{/* Tools & Setup */}
				<SectionCard icon={<Terminal className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('apiDocs.tools.title')} desc={t('apiDocs.tools.desc')}>
					<p className="text-[13px] mb-5" style={{ color: '#9a9892' }}>
						{t('apiDocs.tools.intro')}
					</p>
					<ul className="space-y-5">
						{tools.map(tool => (
							<li key={tool.name} className="rounded-[10px] p-5 space-y-3" style={{ background: '#131313', border: '1px solid #262624' }}>
								<div className="flex items-center justify-between gap-3">
									<div>
										<h4 className="text-[14px] font-bold" style={{ color: '#f4f3ee' }}>{tool.name}</h4>
										<p className="text-[12.5px]" style={{ color: '#9a9892' }}>{tool.desc}</p>
									</div>
									<a href={tool.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] shrink-0" style={{ color: '#9a9892' }}>
										<Github className="h-3.5 w-3.5" /> {t('common.repository')}
									</a>
								</div>
								<div>
									<h5 className="text-[12px] font-semibold mb-1.5" style={{ color: '#9a9892' }}>{t('common.installation')}</h5>
									<CodeSnippet code={tool.install} lang="bash" />
								</div>
								<div>
									<h5 className="text-[12px] font-semibold mb-1.5" style={{ color: '#9a9892' }}>{t('common.usage')}</h5>
									{tool.usageNoteKey && <p className="text-[12px] mb-1.5" style={{ color: '#5c5a55' }}>{t(tool.usageNoteKey)}</p>}
									<CodeSnippet code={tool.usage} lang="bash" />
								</div>
							</li>
						))}
					</ul>
				</SectionCard>

				{/* Security */}
				<SectionCard icon={<ShieldAlert className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('apiDocs.security.title')} desc={t('apiDocs.security.desc')}>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="rounded-[10px] p-5 space-y-3" style={{ background: 'rgba(252,92,4,0.06)', border: '1px solid rgba(252,92,4,0.15)' }}>
							<h4 className="text-[13px] font-bold flex items-center gap-2" style={{ color: '#fc5c04' }}><Lightbulb className="h-4 w-4" />{t('apiDocs.security.strategiesTitle')}</h4>
							<ul className="space-y-2 text-[12.5px]" style={{ color: '#9a9892' }}>
								{strategyKeys.map(key => (
									<li key={key} className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span>{t(key)}</span></li>
								))}
							</ul>
						</div>
						<div className="rounded-[10px] p-5 space-y-3" style={{ background: 'rgba(240,85,74,0.06)', border: '1px solid rgba(240,85,74,0.15)' }}>
							<h4 className="text-[13px] font-bold flex items-center gap-2" style={{ color: '#f0554a' }}><AlertTriangle className="h-4 w-4" />{t('apiDocs.security.cautionsTitle')}</h4>
							<ul className="space-y-2 text-[12.5px]" style={{ color: '#9a9892' }}>
								{cautionKeys.map(key => (
									<li key={key} className="flex items-start gap-2"><span style={{ color: '#f0554a' }}>•</span><span>{t(key)}</span></li>
								))}
							</ul>
						</div>
					</div>
				</SectionCard>

				{/* FAQ */}
				<SectionCard icon={<HelpCircle className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('apiDocs.faq.title')} desc={t('apiDocs.faq.desc')}>
					<div style={{ borderTop: '1px solid #262624' }}>
						<FaqItem q={t('apiDocs.faq.q1')}>
							<p>The Bitcoin Puzzle is a cryptographic challenge aiming to discover the <strong style={{ color: '#f4f3ee' }}>private key</strong> for a known Bitcoin address. Search space spans from 2¹ up to 2²⁵⁶, and pools distribute unexplored ranges for coordinated work.</p>
						</FaqItem>
						<FaqItem q={t('apiDocs.faq.q2')}>
							<p>The pool assigns <strong style={{ color: '#f4f3ee' }}>key ranges</strong> to users via {ic('GET /api/block')}. Users run GPU software to search keys within that range. If a key is found, submit it using {ic('POST /api/block/submit')}; after validation, credits are awarded.</p>
						</FaqItem>
						<FaqItem q={t('apiDocs.faq.q3')}>
							<p>You can use any GPU tool that supports private key range scanning. Common tools include <strong style={{ color: '#f4f3ee' }}>VanitySearch</strong>, <strong style={{ color: '#f4f3ee' }}>VanitySearch-V3</strong>, and <strong style={{ color: '#f4f3ee' }}>BitCrack</strong>, detailed in the Tools &amp; Setup section.</p>
						</FaqItem>
						<FaqItem q={t('apiDocs.faq.q4')}>
							<p>Credits are your reward for completed work. They determine your share of any Bitcoin recovered by the pool. You can check your balance and history on your account dashboard.</p>
						</FaqItem>
						<FaqItem q={t('apiDocs.faq.q5')}>
							<p>If you find a private key matching a target address, <strong style={{ color: '#f4f3ee' }}>do not share it publicly</strong>. Use a safe redemption strategy to avoid on-chain exposure before funds are secured. Publicly exposing a key can lead to bots sweeping funds immediately.</p>
						</FaqItem>
						<FaqItem q={t('apiDocs.faq.q6')}>
							<p>If your work block expires (typically after <strong style={{ color: '#f4f3ee' }}>12 hours</strong>), the range returns to the pool for reassignment. Call {ic('DELETE /api/block')} to clear your active block, then request a new one with {ic('GET /api/block')}.</p>
						</FaqItem>
					</div>
				</SectionCard>

				{/* Related docs */}
				<div className="grid grid-cols-1 md:grid-cols-1 gap-4 pt-4" style={{ borderTop: '1px solid #262624' }}>
					<Link href="/docs/gpu-script" className="volt-card p-5 block hover:border-orange-500 transition-colors" style={{ borderColor: '#262624' }}>
						<h3 className="text-[14px] font-semibold mb-1" style={{ color: '#f4f3ee' }}>{t('apiDocs.related.gpuGuideTitle')}</h3>
						<p className="text-[12.5px]" style={{ color: '#5c5a55' }}>{t('apiDocs.related.gpuGuideDesc')}</p>
					</Link>
				</div>

			</div>
		</div>
	)
}
