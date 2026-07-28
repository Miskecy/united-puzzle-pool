'use client'

import { Code, Settings, Terminal, Github, Code2Icon } from 'lucide-react'
import CodeSnippet from '@/components/CodeSnippet'
import { useTranslation } from '@/contexts/LanguageContext'

const inlineCode = (text: string) => (
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

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
	<div className="rounded-[10px] p-4 space-y-3" style={{ background: '#131313', border: '1px solid #262624' }}>
		<h4 className="text-[13px] font-semibold" style={{ color: '#f4f3ee' }}>{title}</h4>
		{children}
	</div>
)

const exampleSettingsJson = `{
    "api_url": "http://localhost:3000/api/block",
    "additional_addresses": ["YOUR_TARGET_ADDRESS"],
    "user_token": "YOUR_POOL_TOKEN",
    "worker_name": "your_worker_name",
    "program_name": "VanitySearch | cuBitCrack | VanitySearch-V3",
    "gpu_index_map": {
        "0": { "alg_path": "./bin/vanitysearch86-v3", "share": 65 },
        "1": { "alg_path": "./bin/vanitysearch75-v3", "share": 35 }
    },
    "program_arguments": "",
    "block_length": "1T",
    "oneshot": false,
    "post_block_delay_enabled": false,
    "post_block_delay_minutes": 1,
    "send_additional_keys_to_api": false,
    "telegram_share": false,
    "telegram_accesstoken": "YOUR_TELEGRAM_BOT_TOKEN",
    "telegram_chatid": "YOUR_CHAT_ID"
}`

export default function GPUScriptDocs() {
	const { t } = useTranslation()

	const toolSetupItems = [
		{
			name: 'VanitySearch',
			href: 'https://github.com/JeanLucPons/VanitySearch',
			clone: 'git clone https://github.com/JeanLucPons/VanitySearch\ncd VanitySearch\n# Windows: use Release build or prebuilt\n# Linux: make (refer to repo instructions)',
		},
		{
			name: 'VanitySearch-V3 (keyspace support)',
			href: 'https://github.com/Miskecy/VanitySearch-V3',
			clone: 'git clone https://github.com/Miskecy/VanitySearch-V3\ncd VanitySearch-V3\n# Windows: Install CUDA SDK, open VanitySearch.sln in Visual Studio\n# Linux: edit Makefile to set CUDA paths\nmake all',
			noteKey: 'gpuDocs.toolSetup.vanityV3Note',
		},
		{
			name: 'BitCrack',
			href: 'https://github.com/brichard19/BitCrack',
			clone: 'git clone https://github.com/brichard19/BitCrack\ncd BitCrack\n# Windows: open solution in Visual Studio, build cuKeyFinder\n# Linux: make BUILD_CUDA=1 (or BUILD_OPENCL=1)',
		},
	]

	return (
		<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
			<div className="max-w-5xl mx-auto px-4 sm:px-7 py-12 space-y-6">

				{/* Header */}
				<div className="text-center space-y-4 mb-8">
					<div className="flex justify-center">
						<div className="p-4 rounded-2xl" style={{ background: 'rgba(252,92,4,0.1)' }}>
							<Code2Icon className="w-12 h-12" style={{ color: '#fc5c04' }} />
						</div>
					</div>
					<h1 className="text-[40px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('gpuDocs.title')}</h1>
					<p className="text-[15px] max-w-2xl mx-auto" style={{ color: '#9a9892' }}>
						{t('gpuDocs.subtitle')}
					</p>
				</div>

				{/* Overview */}
				<SectionCard icon={<Settings className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('gpuDocs.overview.title')} desc={t('gpuDocs.overview.desc')}>
					<ul className="text-[13px] space-y-2" style={{ color: '#9a9892' }}>
						<li className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span>Fetches a block, writes addresses to {inlineCode('in.txt')}, runs the selected tool with {inlineCode('--keyspace')}, parses {inlineCode('out.txt')}, and posts keys in batches of 10.</span></li>
						<li className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span>Support for mixed-GPU setups using {inlineCode('gpu_index_map')}. You can define specific binaries and weighted shares (e.g., 65% for GPU0, 35% for GPU1) to optimize across different card generations.</span></li>
						<li className="flex items-start gap-2"><span style={{ color: '#fc5c04' }}>•</span><span>Reloads {inlineCode('settings.json')} every iteration so you can edit while running. Supports configurable delay via {inlineCode('post_block_delay_enabled')} and {inlineCode('post_block_delay_minutes')} (default 10s).</span></li>
					</ul>
				</SectionCard>

				{/* Configuration */}
				<SectionCard icon={<Code className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('gpuDocs.config.title')} desc={t('gpuDocs.config.desc')}>
					<CodeSnippet code={exampleSettingsJson} lang="json" />
					<p className="text-[13px] mt-3" style={{ color: '#9a9892' }}>
						Configure {inlineCode('api_url')} and {inlineCode('user_token')}. Use {inlineCode('gpu_index_map')} to assign specific binaries and shares to each GPU index. The {inlineCode('share')} property allows you to balance the workload (e.g., giving a faster card a larger slice of the keyspace).
					</p>
				</SectionCard>

				{/* Usage */}
				<SectionCard icon={<Terminal className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('gpuDocs.usage.title')} desc={t('gpuDocs.usage.desc')}>
					<div className="space-y-4">
						<SubSection title={t('gpuDocs.usage.downloadTitle')}>
							<CodeSnippet code={`git clone https://github.com/Miskecy/united-pool-gpu-script\ncd united-pool-gpu-script`} lang="bash" />
							<a href="https://github.com/Miskecy/united-pool-gpu-script" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] mt-1" style={{ color: '#9a9892' }}>
								<Github className="h-3.5 w-3.5" /> united-pool-gpu-script {t('common.repository')}
							</a>
						</SubSection>
						<SubSection title={t('gpuDocs.usage.installTitle')}>
							<CodeSnippet code={`python -m venv .venv\n.venv\\Scripts\\activate\npip install requests colorama`} lang="bash" />
							<p className="text-[12.5px]" style={{ color: '#9a9892' }}>{t('gpuDocs.usage.installHint')}</p>
						</SubSection>
						<SubSection title={t('gpuDocs.usage.configTitle')}>
							<p className="text-[12.5px]" style={{ color: '#9a9892' }}>Create a {inlineCode('settings.json')} in the repo root using the template above. Set {inlineCode('api_url')}, {inlineCode('user_token')}, and program fields.</p>
						</SubSection>
						<SubSection title={t('gpuDocs.usage.runTitle')}>
							<CodeSnippet code="python script.py" lang="bash" />
							<p className="text-[12.5px]" style={{ color: '#9a9892' }}>{t('gpuDocs.usage.runHint')}</p>
						</SubSection>
					</div>
				</SectionCard>

				{/* Tool Setup */}
				<SectionCard icon={<Code className="h-4 w-4" style={{ color: '#fc5c04' }} />} title={t('gpuDocs.toolSetup.title')} desc={t('gpuDocs.toolSetup.desc')}>
					<div className="space-y-4">
						{toolSetupItems.map(tool => (
							<div key={tool.name} className="rounded-[10px] p-4 space-y-3" style={{ background: '#131313', border: '1px solid #262624' }}>
								<div className="flex items-center justify-between gap-3">
									<h4 className="text-[13px] font-semibold" style={{ color: '#f4f3ee' }}>{tool.name}</h4>
									<a href={tool.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px]" style={{ color: '#9a9892' }}>
										<Github className="h-3.5 w-3.5" /> {t('common.repository')}
									</a>
								</div>
								<CodeSnippet code={tool.clone} lang="bash" />
								{tool.noteKey && <p className="text-[12.5px]" style={{ color: '#9a9892' }}>{t(tool.noteKey)}</p>}
							</div>
						))}
					</div>
				</SectionCard>

			</div>
		</div>
	)
}
