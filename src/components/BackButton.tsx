'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function BackButton({ className }: { className?: string }) {
	const router = useRouter()

	function handleClick() {
		if (typeof window !== 'undefined' && window.history.length > 1) {
			router.back()
		} else {
			router.push('/overview')
		}
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			className={cn("inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium cursor-pointer", className)}
		>
			<ArrowLeft className="h-4 w-4" />
			<span className="text-sm">Back</span>
		</button>
	)
}

