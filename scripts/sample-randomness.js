require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

function randomBigIntBelow(max) {
    if (max <= 1n) return 0n;
    const bitLen = max.toString(2).length;
    const byteLen = Math.ceil(bitLen / 8);
    const mask = (1n << BigInt(bitLen)) - 1n;
    while (true) {
        const buf = crypto.randomBytes(byteLen);
        let rnd = 0n;
        for (let i = 0; i < buf.length; i++) rnd = (rnd << 8n) + BigInt(buf[i]);
        rnd = rnd & mask;
        if (rnd < max) return rnd;
    }
}

function randomIndexByWeights(weights) {
    if (!weights.length) return 0;
    let total = 0n;
    for (let i = 0; i < weights.length; i++)
        total += weights[i] > 0n ? weights[i] : 0n;
    if (total <= 0n) return 0;
    const r = randomBigIntBelow(total);
    let acc = 0n;
    for (let i = 0; i < weights.length; i++) {
        const w = weights[i] > 0n ? weights[i] : 0n;
        acc += w;
        if (r < acc) return i;
    }
    return weights.length - 1;
}

function hex64(bi) {
    return '0x' + bi.toString(16).padStart(64, '0');
}

async function main() {
    const prisma = new PrismaClient();
    try {
        const cfg = await prisma.puzzleConfig.findFirst({
            where: { active: true },
        });
        const puzzleStart = cfg?.puzzleStartRange
            ? BigInt(
                  cfg.puzzleStartRange.startsWith('0x')
                      ? cfg.puzzleStartRange
                      : '0x' + cfg.puzzleStartRange
              )
            : 0n;
        const puzzleEnd = cfg?.puzzleEndRange
            ? BigInt(
                  cfg.puzzleEndRange.startsWith('0x')
                      ? cfg.puzzleEndRange
                      : '0x' + cfg.puzzleEndRange
              )
            : 1n << 71n;
        const maxRange = puzzleEnd - puzzleStart;

        const envMin = process.env.BLOCK_RANGE_MIN_KEYS
            ? BigInt(process.env.BLOCK_RANGE_MIN_KEYS)
            : 1000000000000n;
        const envMax = process.env.BLOCK_RANGE_MAX_KEYS
            ? BigInt(process.env.BLOCK_RANGE_MAX_KEYS)
            : envMin;
        const min = envMin < 1n ? 1n : envMin;
        const max = envMax < min ? min : envMax;
        const spanLen = max - min + 1n;
        const size = min + randomBigIntBelow(spanLen);
        const sizeClamped = size > maxRange ? maxRange : size;

        const reserved = await prisma.blockAssignment.findMany({
            where: { OR: [{ status: 'COMPLETED' }, { status: 'ACTIVE' }] },
            select: { startRange: true, endRange: true },
            orderBy: { startRange: 'asc' },
        });
        const intervals = reserved
            .map(r => ({
                start: BigInt(r.startRange),
                end: BigInt(r.endRange),
            }))
            .filter(iv => iv.start < iv.end)
            .sort((a, b) =>
                a.start < b.start ? -1 : a.start > b.start ? 1 : 0
            );

        const merged = [];
        for (const iv of intervals) {
            if (!merged.length) {
                merged.push({ ...iv });
                continue;
            }
            const last = merged[merged.length - 1];
            if (iv.start <= last.end) {
                if (iv.end > last.end) last.end = iv.end;
            } else {
                merged.push({ ...iv });
            }
        }

        const freeSegments = [];
        let cursor = puzzleStart;
        for (const iv of merged) {
            if (cursor < iv.start)
                freeSegments.push({ start: cursor, end: iv.start });
            if (cursor < iv.end) cursor = iv.end;
        }
        if (cursor < puzzleEnd)
            freeSegments.push({ start: cursor, end: puzzleEnd });

        const candidates = freeSegments.filter(
            seg => seg.end - seg.start >= sizeClamped
        );
        const weights = candidates.map(seg => {
            const w = seg.end - seg.start - sizeClamped + 1n;
            return w > 0n ? w : 0n;
        });
        const samples = [];
        for (let i = 0; i < 30; i++) {
            const idx = randomIndexByWeights(weights);
            const seg = candidates[idx] || freeSegments[0];
            const span = seg.end - seg.start - sizeClamped + 1n;
            const offset = randomBigIntBelow(span > 0n ? span : 1n);
            const start = seg.start + offset;
            const end = start + sizeClamped;
            const rel = start > puzzleStart ? start - puzzleStart : 0n;
            const pctScaled =
                maxRange > 0n ? Number((rel * 10000n) / maxRange) : 0;
            samples.push({
                start: hex64(start),
                end: hex64(end),
                pct: pctScaled / 100,
            });
        }

        const percents = samples.map(s => s.pct);
        const mean = percents.reduce((a, b) => a + b, 0) / percents.length;
        const variance =
            percents.reduce((a, b) => a + (b - mean) * (b - mean), 0) /
            percents.length;
        const stddev = Math.sqrt(variance);
        const bins = new Array(10).fill(0);
        for (const p of percents) {
            let idx = Math.floor(p / 10);
            if (idx < 0) idx = 0;
            if (idx > 9) idx = 9;
            bins[idx]++;
        }
        console.log(JSON.stringify({ samples, mean, stddev, bins }, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
