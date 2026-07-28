'use client'
import { useState } from 'react'
import { Database, Download, Upload, RotateCw } from 'lucide-react'

type DbStatus = {
	tables: number
	tableNames: string[]
	dbFile: string
	envUrl: string
	sizeBytes: number
	pathMismatch?: boolean
	suggestedEnvUrl?: string
}

export function AdminToolsTab() {
	const [dbStatus, setDbStatus] = useState<DbStatus | null>(null)
	const [dbStatusLoading, setDbStatusLoading] = useState(false)
	const [backupLoading, setBackupLoading] = useState(false)
	const [restoring, setRestoring] = useState(false)
	const [restoreFile, setRestoreFile] = useState<File | null>(null)
	const [restoreMsg, setRestoreMsg] = useState('')

	async function checkDbStatus() {
		setDbStatusLoading(true)
		try {
			const r = await fetch('/api/config/backup?status=1')
			if (r.ok) {
				const j = await r.json()
				setDbStatus({
					tables: Number(j.tables || 0),
					tableNames: Array.isArray(j.tableNames) ? j.tableNames.map((s: unknown) => String(s)) : [],
					dbFile: String(j.dbFile || ''),
					envUrl: String(j.envUrl || ''),
					sizeBytes: Number(j.sizeBytes || 0),
					pathMismatch: !!j.pathMismatch,
					suggestedEnvUrl: j.suggestedEnvUrl ? String(j.suggestedEnvUrl) : undefined,
				})
			}
		} catch { } finally { setDbStatusLoading(false) }
	}

	async function downloadBackup() {
		setBackupLoading(true)
		try {
			const r = await fetch('/api/config/backup')
			if (!r.ok) {
				const j = await r.json().catch(() => ({}))
				setRestoreMsg(String(j?.error || 'Backup failed'))
				return
			}
			const blob = await r.blob()
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			const now = new Date()
			const pad = (n: number) => n.toString().padStart(2, '0')
			a.download = `backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.db`
			document.body.appendChild(a)
			a.click()
			a.remove()
			// Delay revoke so browser has time to start the download
			setTimeout(() => URL.revokeObjectURL(url), 10000)
		} catch { setRestoreMsg('Backup failed') } finally { setBackupLoading(false) }
	}

	async function restoreBackup() {
		if (!restoreFile) return
		setRestoring(true); setRestoreMsg('')
		try {
			const fd = new FormData()
			fd.append('file', restoreFile)
			const r = await fetch('/api/config/backup', { method: 'POST', body: fd })
			if (r.ok) {
				setRestoreMsg('Restored! Reloading…')
				setTimeout(() => window.location.reload(), 1500)
			} else {
				const j = await r.json().catch(() => ({}))
				setRestoreMsg(String(j?.error || 'Restore failed'))
			}
		} catch { setRestoreMsg('Restore failed') } finally { setRestoring(false); setRestoreFile(null) }
	}

	return (
		<div className="space-y-5">
			<div className="volt-card">
				<div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #262624' }}>
					<div className="flex items-center gap-2">
						<Database className="h-4 w-4" style={{ color: '#fc5c04' }} />
						<span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}>Database Management</span>
					</div>
					<p className="text-[12.5px] mt-1" style={{ color: '#5c5a55' }}>Export a backup or restore from a previous backup file.</p>
				</div>
				<div className="px-6 py-5 space-y-6">
					{/* Backup */}
					<div>
						<h3 className="text-[14px] font-semibold mb-2 flex items-center gap-2" style={{ color: '#f4f3ee' }}>
							<Download className="h-4 w-4" style={{ color: '#fc5c04' }} />Backup
						</h3>
						<p className="text-[12.5px] mb-3" style={{ color: '#5c5a55' }}>Download the current database file for safekeeping.</p>
						<button className="volt-btn-primary" disabled={backupLoading} onClick={downloadBackup}>
							{backupLoading
								? <><RotateCw className="h-4 w-4 animate-spin" /> Generating…</>
								: <><Download className="h-4 w-4" /> Download Backup</>}
						</button>
					</div>

					{/* Restore */}
					<div style={{ borderTop: '1px solid #262624', paddingTop: 20 }}>
						<h3 className="text-[14px] font-semibold mb-1 flex items-center gap-2" style={{ color: '#f4f3ee' }}>
							<Upload className="h-4 w-4" style={{ color: '#3ddc84' }} />Restore
						</h3>
						<p className="text-[12.5px] mb-3" style={{ color: '#f0554a' }}>Warning: restoring will overwrite all current data.</p>
						<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
							<div className="volt-input-wrap flex-1">
								<input
									type="file"
									accept=".db,application/octet-stream"
									onChange={e => setRestoreFile(e.target.files?.[0] || null)}
									style={{ color: '#9a9892' }}
								/>
							</div>
							<button className="volt-btn-primary" disabled={!restoreFile || restoring} onClick={restoreBackup}>
								{restoring
									? <><RotateCw className="h-4 w-4 animate-spin" /> Restoring…</>
									: <><Upload className="h-4 w-4" /> Restore</>}
							</button>
						</div>
						{restoreMsg && (
							<p className="text-[12px] mt-2" style={{ color: restoreMsg.includes('!') ? '#3ddc84' : '#f0554a' }}>{restoreMsg}</p>
						)}
					</div>

					{/* DB Status */}
					<div style={{ borderTop: '1px solid #262624', paddingTop: 20 }}>
						<h3 className="text-[14px] font-semibold mb-3 flex items-center gap-2" style={{ color: '#f4f3ee' }}>
							<RotateCw className="h-4 w-4" style={{ color: '#9a9892' }} />Database Status
						</h3>
						<button className="volt-btn-ghost" disabled={dbStatusLoading} onClick={checkDbStatus}>
							{dbStatusLoading
								? <><RotateCw className="h-4 w-4 animate-spin" /> Checking…</>
								: <><RotateCw className="h-4 w-4" /> Check Status</>}
						</button>
						{dbStatus && (
							<div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
								{dbStatus.pathMismatch && (
									<div className="md:col-span-2 rounded-[10px] p-3" style={{ background: '#3a1512', border: '1px solid rgba(240,85,74,0.3)' }}>
										<p className="text-[11.5px] font-semibold mb-1" style={{ color: '#f0554a' }}>DATABASE_URL mismatch</p>
										<p className="text-[11px] font-mono break-all" style={{ color: '#f0554a' }}>Current: {dbStatus.envUrl}</p>
										<p className="text-[11px] font-mono break-all" style={{ color: '#f0554a' }}>Suggested: {dbStatus.suggestedEnvUrl}</p>
									</div>
								)}
								{([
									['URL', dbStatus.envUrl],
									['File', dbStatus.dbFile],
									['Tables', String(dbStatus.tables)],
									['Size', dbStatus.sizeBytes ? `${(dbStatus.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : '—'],
								] as [string, string][]).map(([label, val]) => (
									<div key={label} className="rounded-[10px] p-3" style={{ background: '#131313', border: '1px solid #262624' }}>
										<p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>{label}</p>
										<code className="text-[12px] font-mono break-all" style={{ color: '#9a9892' }}>{val}</code>
									</div>
								))}
								<div className="md:col-span-2 rounded-[10px] p-3" style={{ background: '#131313', border: '1px solid #262624' }}>
									<p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#5c5a55' }}>Tables</p>
									<code className="text-[12px] font-mono break-all" style={{ color: '#9a9892' }}>{dbStatus.tableNames.join(', ') || '—'}</code>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
