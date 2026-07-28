import ClientSetup from './ClientSetup'
import SetupUnavailableCard from '@/components/SetupUnavailableCard'
export const dynamic = 'force-dynamic'

function hasSecret() {
	return !!(process.env.SETUP_SECRET && process.env.SETUP_SECRET.trim())
}

export default function SetupPage() {
	const enabled = hasSecret()
	if (enabled) return <ClientSetup />
	return <SetupUnavailableCard />
}
