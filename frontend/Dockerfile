FROM node:20-alpine AS base

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

# --- dev target: Vite dev server with HMR ---
FROM base AS dev

EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- production build ---
FROM base AS build

RUN npm run build

# --- production target: static files served by nginx ---
FROM nginx:alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
