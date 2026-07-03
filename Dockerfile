# Single image: the Fastify API + the built React app (served from web/dist on
# the same origin). The server runs from TypeScript source via tsx, so the repo
# layout (server/src next to web/dist) is preserved in the final image.
#
# Node 22 (matches the local toolchain). Debian slim rather than alpine because
# `sharp` (used for the photo-import pipeline) ships prebuilt glibc binaries.

# ---- build stage: install everything, build the web bundle, drop dev deps ----
FROM node:22-slim AS build
WORKDIR /app

# Install with the lockfile first (better layer caching). Copy every workspace's
# manifest so `npm ci` can resolve the workspace graph.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --include=dev

# Bring in the source and build the React app (root build == vite build for web).
COPY . .
RUN npm run build

# Strip dev-only tooling (vite, typescript, vitest, ...); tsx + fastify + sharp
# and the other runtime deps stay because they're real dependencies.
RUN npm prune --omit=dev

# ---- runtime stage: just the built app + pruned node_modules ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# PORT is read by the server (defaults to 8790); override at run time if needed.
ENV PORT=8790

COPY --from=build /app ./

EXPOSE 8790

# Liveness: hit the same health endpoint Render uses.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8790)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
