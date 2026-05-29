# ── Stage 1: Dependencies ──
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# ── Stage 2: Build ──
FROM deps AS build
COPY . .
RUN npm run build

# ── Stage 3: Production ──
FROM node:22-slim AS production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/src/db ./apps/api/src/db
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared ./packages/shared
COPY apps/api/package.json apps/api/
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["sh", "-c", "cd apps/api && node dist/db/migrate.js 2>/dev/null; node dist/main.js"]
