import { headers } from 'next/headers'
import BlockDetailsClient from '@/components/BlockDetailsClient'

interface BlockData {
	id: string; bitcoinAddress: string; puzzleAddress?: string | null; tokenMasked: string
	status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | string
	hexRangeStart: string; hexRangeEnd: string; hexRangeStartRaw: string; hexRangeEndRaw: string
	assignedAt: string; completedAt?: string | null; expiresAt?: string | null
	durationSeconds: number | null; keysValidated: number; avgSpeedKeysPerSec: number | null
	creditsAwarded: number; checkworkAddresses: string[]; privateKeys: (string | undefined)[]
	addressMap: { privateKey?: string; address: string; isValid: boolean }[]
	matchedCount: number; missingAddresses: string[]
}

export default async function BlockDetailsPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const h = await headers()
	const host = h.get('host') || 'localhost:3000'
	const proto = h.get('x-forwarded-proto') || 'http'
	const res = await fetch(`${proto}://${host}/api/block/${id}`, { cache: 'no-store' })
	const ok = res.ok
	let block: BlockData | null = null
	let dataError: { error?: string } | null = null
	try {
		const parsed = await res.json()
		if (ok) block = parsed as BlockData
		else dataError = parsed as { error?: string }
	} catch { }

	return <BlockDetailsClient id={id} ok={ok} block={block} dataError={dataError} />
}
