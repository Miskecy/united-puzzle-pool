'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatTimeRemaining } from '@/lib/utils';
import { RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface BlockData {
	id: string;
	hexRangeStart: string;
	hexRangeEnd: string;
	checkworkAddresses: string[];
	expiresAt: string;
}

interface MiningBlockProps {
	token: string;
	onBlockCompleted?: (creditsAwarded: number) => void;
}

export default function MiningBlock({ token, onBlockCompleted }: MiningBlockProps) {
	const [block, setBlock] = useState<BlockData | null>(null);
	const [loading, setLoading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [timeRemaining, setTimeRemaining] = useState('');
	const [privateKeys, setPrivateKeys] = useState<string[]>(['', '', '', '', '', '', '', '', '', '']);

	const fetchBlock = useCallback(async () => {
		try {
			setLoading(true);
			const response = await fetch('/api/block', {
				headers: {
					'pool-token': token,
				}
			});

			if (!response.ok) {
				throw new Error('Failed to fetch block');
			}

			const data = await response.json();
			setBlock(data);

			// Initialize private keys array
			setPrivateKeys(['', '', '', '', '', '', '', '', '', '']);

		} catch (error) {
			console.error('Error fetching block:', error);
			toast.error('Failed to fetch block');
		} finally {
			setLoading(false);
		}
	}, [token]);

	const updateTimeRemaining = useCallback(() => {
		if (block) {
			const remaining = formatTimeRemaining(new Date(block.expiresAt));
			setTimeRemaining(remaining);

			if (remaining === 'Expired') {
				toast.error('Block has expired');
				setBlock(null);
			}
		}
	}, [block]);

	useEffect(() => {
		if (token) {
			fetchBlock();
		}
	}, [token, fetchBlock]);

	useEffect(() => {
		if (block) {
			updateTimeRemaining();
			const interval = setInterval(updateTimeRemaining, 1000);
			return () => clearInterval(interval);
		}
	}, [block, updateTimeRemaining]);

	const handlePrivateKeyChange = (index: number, value: string) => {
		const newKeys = [...privateKeys];
		newKeys[index] = value;
		setPrivateKeys(newKeys);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!block) {
			toast.error('No active block');
			return;
		}

		// Validate all keys are provided
		const emptyKeys = privateKeys.filter(key => !key.trim()).length;
		if (emptyKeys > 0) {
			toast.error(`Please provide all 10 private keys (${emptyKeys} missing)`);
			return;
		}

		try {
			setSubmitting(true);
			const response = await fetch('/api/block/submit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'pool-token': token,
				},
				body: JSON.stringify({
					privateKeys: privateKeys.map(key => key.trim()),
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to submit block');
			}

			toast.success(`Block completed! Awarded ${data.creditsAwarded} credits`);
			onBlockCompleted?.(data.creditsAwarded);

			// Fetch a new block
			fetchBlock();

		} catch (error) {
			console.error('Error submitting block:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to submit block');
		} finally {
			setSubmitting(false);
		}
	};

	const copyAddress = (address: string) => {
		copyToClipboard(address);
	};

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied to clipboard');
		} catch (error) {
			console.error('Error copying to clipboard:', error);
			toast.error('Failed to copy to clipboard');
		}
	};

	if (!token) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Block Mining</CardTitle>
					<CardDescription>
						Please enter your token in the dashboard to start mining
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (loading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Block Mining</CardTitle>
					<CardDescription>
						Loading your current block...
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!block) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Block Mining</CardTitle>
					<CardDescription>
						No active block assigned. Click below to get a new block.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={fetchBlock}>
						<RefreshCw className="h-4 w-4 mr-2" />
						Get New Block
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Block Mining</CardTitle>
				<CardDescription>
					Solve this block by finding the private keys for the addresses below
				</CardDescription>
			</CardHeader>
			<CardContent>
				{/* Block Info */}
				<div className="mb-6 p-4 bg-gray-50 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-sm text-gray-600">Block ID:</span>
						<span className="font-mono text-sm">{block.id.slice(0, 16)}...</span>
					</div>
					<div className="flex items-center justify-between mb-2">
						<span className="text-sm text-gray-600">Hex Range:</span>
						<span className="font-mono text-sm">
							{block.hexRangeStart.slice(0, 16)}...{block.hexRangeEnd.slice(-16)}
						</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-sm text-gray-600">Time Remaining:</span>
						<Badge
							variant={timeRemaining === 'Expired' ? 'destructive' : 'secondary'}
							className={timeRemaining === 'Expired' ? '' : 'bg-orange-100 text-orange-800'}
						>
							{timeRemaining}
						</Badge>
					</div>
				</div>

				{/* Checkwork Addresses */}
				<div className="mb-6">
					<h3 className="text-lg font-semibold mb-4">Checkwork Addresses</h3>
					<div className="space-y-3">
						{block.checkworkAddresses.map((address, index) => (
							<div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
								<Badge variant="outline" className="min-w-8">
									{index + 1}
								</Badge>
								<span className="font-mono text-sm flex-1">{address}</span>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => copyAddress(address)}
								>
									<Copy className="h-4 w-4" />
								</Button>
							</div>
						))}
					</div>
				</div>

				{/* Private Key Input Form */}
				<form onSubmit={handleSubmit} className="space-y-4">
					<h3 className="text-lg font-semibold">Private Keys</h3>
					<p className="text-sm text-gray-600 mb-4">
						Enter the private keys corresponding to each address above:
					</p>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{privateKeys.map((key, index) => (
							<div key={index} className="space-y-2">
								<label className="text-sm font-medium text-gray-700">
									Address {index + 1}
								</label>
								<Input
									type="text"
									placeholder="Enter private key..."
									value={key}
									onChange={(e) => handlePrivateKeyChange(index, e.target.value)}
									className="font-mono text-sm"
								/>
							</div>
						))}
					</div>

					<div className="flex gap-4">
						<Button
							type="submit"
							disabled={submitting || timeRemaining === 'Expired'}
							className="bg-green-600 hover:bg-green-700"
						>
							{submitting ? (
								<>
									<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
									Submitting...
								</>
							) : (
								'Submit Block'
							)}
						</Button>

						<Button
							type="button"
							onClick={fetchBlock}
							variant="outline"
							disabled={submitting}
						>
							<RefreshCw className="h-4 w-4 mr-2" />
							Refresh Block
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}