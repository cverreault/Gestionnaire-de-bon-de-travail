# ─── Stage 1 : Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les manifestes en premier pour bénéficier du cache des layers
COPY package.json package-lock.json* ./

# npm ci : installation stricte depuis package-lock.json
RUN npm ci

# Copier les sources
COPY . .

# Variables VITE_* injectées au build (Vite les fige dans le bundle).
# VITE_BASE_DOMAIN sert à l'aperçu des sous-domaines tenants (slug.<domaine>).
ARG VITE_BASE_DOMAIN=taskmgr.local
ENV VITE_BASE_DOMAIN=$VITE_BASE_DOMAIN

# Build Vite → dist/
RUN npm run build

# ─── Stage 2 : Serveur Nginx (SPA) ────────────────────────────────────────────
FROM nginx:alpine AS production

# Installer wget pour les health checks Docker
RUN apk add --no-cache wget

# Supprimer la config nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Config nginx dédiée au SPA React (fallback index.html + cache)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier les assets buildés
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Health check natif Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
