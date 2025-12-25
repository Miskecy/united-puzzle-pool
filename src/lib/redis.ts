import { createClient } from 'redis';
import { randomUUID } from 'crypto';

const redisClient = createClient({
	url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

export async function connectRedis() {
	if (!redisClient.isOpen) {
		await redisClient.connect();
	}
	return redisClient;
}

export async function getRedisClient() {
	return await connectRedis();
}

export async function setBlockExpiration(blockId: string, expiresAt: Date) {
	const client = await connectRedis();
	await client.setEx(`block:${blockId}:expires`, 86400, expiresAt.toISOString());
}

export async function getBlockExpiration(blockId: string) {
	const client = await connectRedis();
	const expiresAt = await client.get(`block:${blockId}:expires`);
	return expiresAt ? new Date(expiresAt) : null;
}

export async function deleteBlockExpiration(blockId: string) {
	const client = await connectRedis();
	await client.del(`block:${blockId}:expires`);
}

export async function getActiveBlockByToken(tokenId: string, workerId?: string | null) {
	const client = await connectRedis();
	const key = workerId ? `token:${tokenId}:${workerId}:active-block` : `token:${tokenId}:active-block`;
	const activeBlock = await client.get(key);
	return activeBlock;
}

export async function setActiveBlock(tokenId: string, blockId: string, workerId?: string | null, ttl?: number) {
	const client = await connectRedis();
	const key = workerId ? `token:${tokenId}:${workerId}:active-block` : `token:${tokenId}:active-block`;
	if (ttl) {
		await client.set(key, blockId, { EX: ttl });
	} else {
		await client.set(key, blockId);
	}
}

export async function clearActiveBlock(tokenId: string, workerId?: string | null) {
	const client = await connectRedis();
	const key = workerId ? `token:${tokenId}:${workerId}:active-block` : `token:${tokenId}:active-block`;
	await client.del(key);
}

export default redisClient;

export async function acquireLock(key: string, ttlMs: number) {
	const client = await connectRedis();
	const token = randomUUID();
	const res = await client.set(key, token, { NX: true, PX: ttlMs });
	return res ? token : null;
}

export async function releaseLock(key: string, token: string) {
	const client = await connectRedis();
	const script = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
	await client.eval(script, { keys: [key], arguments: [token] });
}

export async function acquireAssignmentLock() {
	return await acquireLock('lock:block-assignment', 5000);
}

export async function releaseAssignmentLock(token: string) {
	await releaseLock('lock:block-assignment', token);
}
