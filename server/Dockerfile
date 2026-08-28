# --- build stage -----------------------------------------------------------
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# --- runtime stage ---------------------------------------------------------
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist

EXPOSE 4000
# Runs migrations on container start. For zero-downtime deploys, move this
# into a separate release step on whatever platform you use.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
