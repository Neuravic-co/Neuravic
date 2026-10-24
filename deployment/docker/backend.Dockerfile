# One image for every backend service and the file server. The service is chosen by ENTRY when the container starts:
#   nbe/services/gateway/src/index.ts   nbe/services/auth/src/index.ts   nbe/services/portal/src/index.ts
#   nbe/services/leads/src/index.ts     nbe/services/admin/src/index.ts   nbe/services/worker/src/index.ts
#   server/src/index.ts                 database/scripts/migrate.ts       (run once per release)
# Build from the repository root:  docker build -f deployment/docker/backend.Dockerfile -t neuravic-backend .

FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY nbe/core/package.json nbe/core/package.json
COPY nbe/services/gateway/package.json nbe/services/gateway/package.json
COPY nbe/services/auth/package.json nbe/services/auth/package.json
COPY nbe/services/portal/package.json nbe/services/portal/package.json
COPY nbe/services/leads/package.json nbe/services/leads/package.json
COPY nbe/services/admin/package.json nbe/services/admin/package.json
COPY nbe/services/worker/package.json nbe/services/worker/package.json
COPY server/package.json server/package.json
COPY database/package.json database/package.json
RUN npm ci --omit=dev --ignore-scripts

FROM node:25-alpine
ENV NODE_ENV=production HOST=0.0.0.0 UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY nbe ./nbe
COPY server ./server
COPY database ./database
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
ARG ENTRY=nbe/services/gateway/src/index.ts
ENV ENTRY=${ENTRY}
EXPOSE 8787
CMD ["sh", "-c", "exec node --import tsx \"$ENTRY\""]
