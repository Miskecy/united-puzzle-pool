'use client'

import { Button } from '@/components/ui/button'

export default function CopyButton({ text, children, className }: { text: string, children?: React.ReactNode, className?: string }) {
  async function handleClick() {
    try { await navigator.clipboard.writeText(text) } catch { }
  }
  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={handleClick}>
      {children || 'Copy'}
    </Button>
  )
}

