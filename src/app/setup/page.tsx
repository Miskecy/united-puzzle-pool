import { redirect } from 'next/navigation'
import ClientSetup from './ClientSetup'

function hasSecret() {
	return !!(process.env.SETUP_SECRET && process.env.SETUP_SECRET.trim())
}

export default function SetupPage() {
  if (!hasSecret()) redirect('/')
  return <ClientSetup />
}
