# syntax=docker/dockerfile:1

# 1) Dependencies stage - install node_modules with cacheable layer
FROM node:20-alpine AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci

# 2) Builder stage - build Next.js in standalone mode
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . ./
RUN mkdir -p public
RUN npm run build

# 3) Runner stage - minimal runtime using standalone output
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy the minimal standalone server and static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

USER node
EXPOSE 3000

# Default command for production; dev uses compose override
CMD ["node", "server.js"]
