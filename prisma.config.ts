import path from 'path'
import { defineConfig } from 'prisma/config'

function resolveDbUrl(): string {
	const raw = (process.env.DATABASE_URL || '').trim()
	if (!raw) return `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`
	if (raw.startsWith('file:')) {
		const p = raw.slice(5)
		if (path.isAbsolute(p)) return raw
		const normalized = p.replace(/^[./\\]+/, '')
		const inPrisma = normalized.startsWith('prisma/') || normalized.startsWith(`prisma${path.sep}`)
		const abs = inPrisma
			? path.join(process.cwd(), normalized)
			: path.join(process.cwd(), 'prisma', normalized)
		return `file:${abs}`
	}
	return raw
}

export default defineConfig({
	schema: './prisma/schema.prisma',
	datasource: {
		url: resolveDbUrl(),
	},
})
