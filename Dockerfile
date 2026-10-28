# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    DATABASE_PATH=/var/data/studio.sqlite
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
# tsx executes the TypeScript server; it is included in the installed dependencies.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /var/data && chown node:node /var/data
USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--use-env-proxy", "--import", "tsx", "server/index.ts"]
