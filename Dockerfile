# AHCL 360 – API + web admin panel in one image.
# The admin panel is built and served by the API on the same domain (no CORS setup needed).
#   docker build -t ahcl360 .
#   docker run -p 4000:4000 --env-file backend/.env -v ahcl-uploads:/data ahcl360

# ---- 1. build the admin panel ----
FROM node:22-alpine AS admin
WORKDIR /build/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# ---- 2. API runtime ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=4000 \
    ADMIN_DIST_DIR=/app/admin-dist \
    UPLOAD_DIR=/data/uploads
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY --from=admin /build/admin/dist /app/admin-dist
# Encrypted uploads live on a volume so they survive redeploys.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "src/server.js"]
