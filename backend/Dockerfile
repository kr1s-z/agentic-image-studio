FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

# --- build target: compile TypeScript ---
FROM base AS builder
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# --- dev target: tsx with hot reload ---
FROM base AS dev
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
EXPOSE 3000
CMD ["npx", "tsx", "watch", "src/index.ts"]

# --- production target ---
FROM base AS production
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p uploads
EXPOSE 3000
CMD ["node", "dist/index.js"]
