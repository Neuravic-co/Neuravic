# The website and client portal (Next.js).
# Build from the repository root:
#   docker build -f deployment/docker/frontend.Dockerfile -t neuravic-frontend .
# NEXT_PUBLIC_* values are fixed at build time. Leave NEXT_PUBLIC_API_BASE_URL empty so the browser calls /api/v1
# on the site's own domain and the built-in proxy forwards to API_ORIGIN (set when the container starts).

FROM node:25-alpine AS build
WORKDIR /app
COPY nfe/package.json nfe/package-lock.json ./
RUN npm ci
COPY nfe ./
ARG NEXT_PUBLIC_PORTAL_OPEN=true
ARG NEXT_PUBLIC_API_BASE_URL=
ENV NEXT_PUBLIC_PORTAL_OPEN=${NEXT_PUBLIC_PORTAL_OPEN} NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN npm run build && npm prune --omit=dev

FROM node:25-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 5173
CMD ["npx", "next", "start", "-p", "5173", "-H", "0.0.0.0"]
