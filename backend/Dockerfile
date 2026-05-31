# ─── Stage 1 : Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# OpenSSL est requis par Prisma pour générer / charger le moteur natif
RUN apk add --no-cache openssl

# Copier les manifestes en premier pour bénéficier du cache des layers
COPY package.json package-lock.json* ./

# npm ci : installation stricte depuis package-lock.json
RUN npm ci

# Copier les sources
COPY . .

# Générer le client Prisma
RUN npx prisma generate

# Compiler NestJS → dist/
RUN npm run build

# ─── Stage 2 : Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# wget/curl pour les health checks Docker, openssl pour Prisma,
# postgresql-client pour pg_dump/psql utilisés par la feature backup/restore.
RUN apk add --no-cache wget curl openssl postgresql16-client

ENV NODE_ENV=production

# Installer uniquement les dépendances de production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copier les artefacts compilés
COPY --from=builder /app/dist ./dist

# Copier le client Prisma généré (binaires natifs inclus)
COPY --from=builder /app/node_modules/.prisma  ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma  ./node_modules/@prisma

# Copier le schéma Prisma (nécessaire pour migrate deploy)
COPY prisma ./prisma

# Utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nestjs -u 1001 && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

# Health check natif Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Migrations Prisma puis démarrage de l'application
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
