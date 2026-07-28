'use client'

import { useState } from 'react'
import RouteGuard from '@/components/RouteGuard'
import { PuzzlesTab } from '@/components/admin/PuzzlesTab'
import { BlocksTab } from '@/components/admin/BlocksTab'
import { RedeemTab } from '@/components/admin/RedeemTab'
import { AdminToolsTab } from '@/components/admin/AdminToolsTab'
import { Settings, Key, List, Coins, Database } from 'lucide-react'
import { useTranslation } from '@/contexts/LanguageContext'

type Tab = 'puzzles' | 'blocks' | 'redeem' | 'settings'

const TABS = [
	{ id: 'puzzles', Icon: Key, labelKey: 'setupConfig.tabs.puzzles' },
	{ id: 'blocks', Icon: List, labelKey: 'setupConfig.tabs.blocks' },
	{ id: 'redeem', Icon: Coins, labelKey: 'setupConfig.tabs.redemptions' },
	{ id: 'settings', Icon: Database, labelKey: 'setupConfig.tabs.adminTools' },
] as const

export default function SetupConfigPage() {
	const { t } = useTranslation()
	const [tab, setTab] = useState<Tab>('puzzles')

	return (
		<RouteGuard fallback={
			<div className="min-h-screen bg-volt-bg flex items-center justify-center">
				<div className="volt-card p-8 text-center space-y-3">
					<div className="w-8 h-8 rounded-full border-2 mx-auto" style={{ borderColor: '#fc5c04', borderTopColor: 'transparent', animation: 'voltSpin 700ms linear infinite' }} />
					<p className="text-[13px]" style={{ color: '#9a9892' }}>{t('setupConfig.verifying')}</p>
				</div>
			</div>
		}>
			<div className="min-h-screen bg-volt-bg text-volt-text volt-fade-in">
				<div className="max-w-7xl mx-auto px-4 sm:px-7 py-10 space-y-6">

					{/* Header */}
					<div className="flex items-center gap-3 pb-5" style={{ borderBottom: '1px solid #262624' }}>
						<div className="p-2.5 rounded-xl" style={{ background: 'rgba(252,92,4,0.1)' }}>
							<Settings className="h-6 w-6" style={{ color: '#fc5c04' }} />
						</div>
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#fc5c04' }}>{t('setupConfig.admin')}</div>
							<h1 className="text-[24px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('setupConfig.title')}</h1>
						</div>
					</div>

					{/* Tab navigation */}
					<div className="flex flex-wrap gap-2 p-1.5 rounded-[14px]" style={{ background: '#131313', border: '1px solid #262624' }}>
						{TABS.map(({ id, Icon, labelKey }) => (
							<button
								key={id}
								onClick={() => setTab(id)}
								className={`px-4 py-2.5 text-[13px] rounded-xl flex items-center gap-2 ${tab === id ? 'font-semibold' : 'transition-colors'}`}
								style={tab === id ? { background: '#fc5c04', color: '#0a0a0a' } : { color: '#9a9892' }}
							>
								<Icon className="h-4 w-4" /> {t(labelKey)}
							</button>
						))}
					</div>

					{/* Tab content */}
					{tab === 'puzzles' && <PuzzlesTab />}
					{tab === 'blocks' && <BlocksTab />}
					{tab === 'redeem' && <RedeemTab />}
					{tab === 'settings' && <AdminToolsTab />}

				</div>
			</div>
		</RouteGuard>
	)
}
