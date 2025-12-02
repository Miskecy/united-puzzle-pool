/* Analysis script for block assignments */
const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    try {
        const cfg = await prisma.puzzleConfig.findFirst({
            where: { active: true },
        });
        const puzzleStartStr = cfg?.puzzleStartRange || '0x0';
        const puzzleEndStr = cfg?.puzzleEndRange || '0x0';
        const toBI = s => {
            if (typeof s !== 'string') return 0n;
            const t = s.startsWith('0x') ? s : '0x' + s;
            return BigInt(t);
        };
        const puzzleStart = toBI(puzzleStartStr);
        const puzzleEnd = toBI(puzzleEndStr);
        const maxRange = puzzleEnd > puzzleStart ? puzzleEnd - puzzleStart : 0n;

        const blocks = await prisma.blockAssignment.findMany({
            select: {
                id: true,
                status: true,
                startRange: true,
                endRange: true,
            },
        });
        const total = blocks.length;
        const byStatus = { ACTIVE: 0, COMPLETED: 0, EXPIRED: 0 };
        const intervals = [];
        for (const b of blocks) {
            byStatus[b.status] = (byStatus[b.status] || 0) + 1;
            try {
                const s = toBI(b.startRange);
                const e = toBI(b.endRange);
                if (e > s)
                    intervals.push({
                        id: b.id,
                        status: b.status,
                        start: s,
                        end: e,
                    });
            } catch {}
        }

        const keyCount = new Map();
        for (const iv of intervals) {
            const k = `${iv.start}-${iv.end}`;
            keyCount.set(k, (keyCount.get(k) || 0) + 1);
        }
        const duplicates = Array.from(keyCount.entries()).filter(
            ([_, v]) => v > 1
        ).length;

        const ac = intervals
            .filter(iv => iv.status === 'ACTIVE' || iv.status === 'COMPLETED')
            .sort((a, b) =>
                a.start < b.start ? -1 : a.start > b.start ? 1 : 0
            );
        let overlaps = 0;
        for (let i = 1; i < ac.length; i++) {
            if (ac[i].start < ac[i - 1].end) overlaps++;
        }

        const buckets = new Array(256).fill(0);
        for (const iv of intervals) {
            const rel = iv.start > puzzleStart ? iv.start - puzzleStart : 0n;
            const idx = maxRange > 0n ? Number((rel * 256n) / maxRange) : 0;
            const bi = idx < 0 ? 0 : idx > 255 ? 255 : idx;
            buckets[bi]++;
        }

        let totalSize = 0n;
        let minSize = null;
        let maxSize = 0n;
        for (const iv of intervals) {
            const sz = iv.end - iv.start;
            totalSize += sz;
            if (minSize === null || sz < minSize) minSize = sz;
            if (sz > maxSize) maxSize = sz;
        }
        const avgSize =
            total > 0 ? (totalSize / BigInt(total)).toString() : '0';

        console.log(
            JSON.stringify(
                {
                    total,
                    byStatus,
                    duplicates,
                    overlaps,
                    avgSize,
                    minSize: minSize ? minSize.toString() : null,
                    maxSize: maxSize.toString(),
                    buckets,
                },
                null,
                2
            )
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
