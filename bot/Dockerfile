# Sin volumen para base de datos: todo el estado vive en Supabase, el
# contenedor es completamente stateless.

# La imagen oficial de Node desde el espejo público de AWS: Docker Hub limita las descargas y tumbó builds en Railway
# (429 Too Many Requests, 9-oct-2026). Es la misma imagen `node:22-slim`.
FROM public.ecr.aws/docker/library/node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
