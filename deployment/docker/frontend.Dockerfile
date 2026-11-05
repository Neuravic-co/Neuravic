FROM node:22-alpine AS build
WORKDIR /app
COPY nfe/package.json nfe/package-lock.json ./
RUN npm ci
COPY nfe ./
ARG NEXT_PUBLIC_API_BASE_URL=
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 5173
CMD ["npx", "next", "start", "-p", "5173", "-H", "0.0.0.0"]
