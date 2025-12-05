import ClientSetup from './ClientSetup'
export const dynamic = 'force-dynamic'

function hasSecret() {
	return !!(process.env.SETUP_SECRET && process.env.SETUP_SECRET.trim())
}

export default function SetupPage() {
	const enabled = hasSecret()
	if (enabled) return <ClientSetup />
	return (
		<div style={{ maxWidth: 520, margin: '40px auto', padding: 20 }}>
			<h1 style={{ fontSize: 24, fontWeight: 600 }}>Setup Unavailable</h1>
			<p style={{ opacity: 0.8 }}>Set the environment variable <code>SETUP_SECRET</code> to enable setup.</p>
			<p style={{ marginTop: 12 }}>In Docker Compose, add <code>SETUP_SECRET</code> under the app service environment and restart.</p>
		</div>
	)
}
