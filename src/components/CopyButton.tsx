'use client'

import { useTranslation } from '@/contexts/LanguageContext'

export default function CopyButton({ text, children, className }: { text: string, children?: React.ReactNode, className?: string }) {
	const { t } = useTranslation()
	async function handleClick() {
		try { await navigator.clipboard.writeText(text) } catch { }
	}
	return (
		<button type="button" className={className ?? 'volt-btn-ghost text-[12px] px-3'} onClick={handleClick}>
			{children || t('common.copy')}
		</button>
	)
}
