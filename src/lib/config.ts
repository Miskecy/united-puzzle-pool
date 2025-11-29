import { prisma } from '@/lib/prisma'

export type PuzzleConfig = {
	id?: string
	name?: string | null
	address: string
	startHex: string
	endHex: string
	solved?: boolean
	active?: boolean
	privateKey?: string | null
}

export async function loadPuzzleConfig(): Promise<PuzzleConfig | null> {
	try {
		const cfg = await prisma.puzzleConfig.findFirst({ where: { active: true } })
		if (cfg) {
			return {
				id: cfg.id,
				name: cfg.name,
				address: cfg.puzzleAddress,
				startHex: cfg.puzzleStartRange,
				endHex: cfg.puzzleEndRange,
				solved: (cfg as unknown as { solved?: boolean }).solved ?? false,
				active: cfg.active,
				privateKey: (cfg as unknown as { puzzlePrivateKey?: string | null }).puzzlePrivateKey ?? null,
			}
		}
	} catch { }

	const envAddr = process.env.BITCOIN_PUZZLE_ADDRESS || process.env.NEXT_PUBLIC_BITCOIN_PUZZLE_ADDRESS || ''
	const envStart = process.env.PUZZLE_START_RANGE || ''
	const envEnd = process.env.PUZZLE_END_RANGE || ''
	if (envAddr && envStart && envEnd) {
		return { address: envAddr, startHex: envStart, endHex: envEnd }
	}
	return null
}

export async function upsertPuzzleConfig(data: PuzzleConfig): Promise<PuzzleConfig> {
	const saved = await prisma.puzzleConfig.create({
		data: {
			name: data.name || null,
			puzzleAddress: data.address,
			puzzleStartRange: normalizeHex(data.startHex),
			puzzleEndRange: normalizeHex(data.endHex),
			solved: !!data.solved,
			active: !!data.active,
		}
	})
	return { id: saved.id, name: saved.name || null, address: saved.puzzleAddress, startHex: saved.puzzleStartRange, endHex: saved.puzzleEndRange, solved: (saved as unknown as { solved?: boolean }).solved ?? false, active: saved.active, privateKey: (saved as unknown as { puzzlePrivateKey?: string | null }).puzzlePrivateKey ?? null }
}

export async function listPuzzleConfigs(): Promise<PuzzleConfig[]> {
	const items = await prisma.puzzleConfig.findMany({ orderBy: { createdAt: 'desc' } })
	return items.map(i => ({ id: i.id, name: i.name || null, address: i.puzzleAddress, startHex: i.puzzleStartRange, endHex: i.puzzleEndRange, solved: (i as unknown as { solved?: boolean }).solved ?? false, active: i.active, privateKey: (i as unknown as { puzzlePrivateKey?: string | null }).puzzlePrivateKey ?? null }))
}

export async function setActivePuzzle(id: string): Promise<PuzzleConfig | null> {
	await prisma.puzzleConfig.updateMany({ data: { active: false } })
	const updated = await prisma.puzzleConfig.update({ where: { id }, data: { active: true } })
	return { id: updated.id, name: updated.name || null, address: updated.puzzleAddress, startHex: updated.puzzleStartRange, endHex: updated.puzzleEndRange, solved: (updated as unknown as { solved?: boolean }).solved ?? false, active: updated.active, privateKey: (updated as unknown as { puzzlePrivateKey?: string | null }).puzzlePrivateKey ?? null }
}

export async function updatePuzzleConfig(id: string, data: Partial<PuzzleConfig>): Promise<PuzzleConfig | null> {
	const updated = await prisma.puzzleConfig.update({
		where: { id },
		data: {
			name: data.name ?? undefined,
			puzzleAddress: data.address ?? undefined,
			puzzleStartRange: data.startHex !== undefined ? normalizeHex(data.startHex) : undefined,
			puzzleEndRange: data.endHex !== undefined ? normalizeHex(data.endHex) : undefined,
			solved: data.solved ?? undefined,
			puzzlePrivateKey: data.privateKey ?? undefined,
		}
	})
	return { id: updated.id, name: updated.name || null, address: updated.puzzleAddress, startHex: updated.puzzleStartRange, endHex: updated.puzzleEndRange, solved: (updated as unknown as { solved?: boolean }).solved ?? false, active: updated.active, privateKey: (updated as unknown as { puzzlePrivateKey?: string | null }).puzzlePrivateKey ?? null }
}

export async function deletePuzzleConfig(id: string): Promise<boolean> {
	await prisma.puzzleConfig.delete({ where: { id } })
	return true
}

export function normalizeHex(h: string): string {
	const s = (h || '').trim().toLowerCase()
	if (s.startsWith('0x')) return s.slice(2)
	return s
}

export function parseHexBI(h?: string | null): bigint | null {
	try {
		if (!h) return null
		const n = normalizeHex(h)
		if (!n) return null
		return BigInt('0x' + n)
	} catch { return null }
}
