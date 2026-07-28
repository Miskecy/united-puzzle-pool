FROM node:20-slim AS builder
WORKDIR /app
# Build tools required for native modules (better-sqlite3 compiles from source)
RUN apt-get update -y && apt-get install -y python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
# Prune dev dependencies so only production deps are copied to runner
RUN npm prune --production

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
# Copy pre-built node_modules (already compiled) instead of re-running npm ci
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
# prisma.config.ts and migrations are required at runtime for migrate deploy
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/data ./src/data
EXPOSE 3000
CMD ["sh","-c","npx prisma migrate deploy && npm run start -- -p 3000"]
