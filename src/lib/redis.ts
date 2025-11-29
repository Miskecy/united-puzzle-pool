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

export async function getActiveBlockByToken(tokenId: string) {
	const client = await connectRedis();
	const activeBlock = await client.get(`token:${tokenId}:active-block`);
	return activeBlock;
}

export async function setActiveBlock(tokenId: string, blockId: string) {
	const client = await connectRedis();
	await client.set(`token:${tokenId}:active-block`, blockId);
}

export async function clearActiveBlock(tokenId: string) {
	const client = await connectRedis();
	await client.del(`token:${tokenId}:active-block`);
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
