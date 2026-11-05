FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY nbe/package.json nbe/package.json
COPY database/package.json database/package.json
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY nbe/package.json nbe/package.json
COPY nbe/src nbe/src
COPY database ./database
RUN chown -R node:node /app
USER node
EXPOSE 8787
CMD ["node", "--import", "tsx", "nbe/src/index.ts"]
