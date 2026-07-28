'use client'

import { useTranslation } from '@/contexts/LanguageContext'

export default function SetupUnavailableCard() {
	const { t } = useTranslation()
	return (
		<div className="min-h-screen bg-volt-bg text-volt-text flex items-center justify-center">
			<div className="volt-card p-8 max-w-lg w-full mx-4 space-y-3">
				<h1 className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>{t('setup.unavailable')}</h1>
				<p className="text-[13px]" style={{ color: '#9a9892' }}>{t('setup.setEnv')} <code className="font-mono text-[12px] px-1 rounded" style={{ background: '#191919', color: '#fc5c04' }}>SETUP_SECRET</code> {t('setup.toEnable')}</p>
				<p className="text-[13px]" style={{ color: '#9a9892' }}>{t('setup.inDocker')} <code className="font-mono text-[12px] px-1 rounded" style={{ background: '#191919', color: '#fc5c04' }}>SETUP_SECRET</code> {t('setup.underService')}</p>
			</div>
		</div>
	)
}
