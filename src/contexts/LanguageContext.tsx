'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { en } from '@/lib/i18n/en'
import { ptBR } from '@/lib/i18n/pt-br'

export type Lang = 'en' | 'pt-BR'

const STORAGE_KEY = 'upp-lang'

const translations: Record<Lang, typeof en> = { en, 'pt-BR': ptBR }

function getPath(obj: unknown, path: string): string {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return path
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : path
}

function detectBrowserLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const nav = navigator.language || ''
  if (nav.startsWith('pt')) return 'pt-BR'
  return 'en'
}

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null
    const resolved = stored === 'en' || stored === 'pt-BR' ? stored : detectBrowserLang()
    setLangState(resolved)
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const t = useCallback(
    (key: string) => getPath(translations[lang], key),
    [lang]
  )

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  return useContext(LanguageContext)
}
