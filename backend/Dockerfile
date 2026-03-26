FROM node:20-alpine AS base

WORKDIR /app
COPY package.json package-lock.json* ./

# --- dev target: nodemon with hot reload ---
FROM base AS dev

RUN npm ci
COPY . .

EXPOSE 3000
CMD ["npx", "nodemon", "index.js"]

# --- production target ---
FROM base AS production

RUN npm ci --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
