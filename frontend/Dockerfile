# syntax=docker/dockerfile:1
# Base images are pinned by digest (G3). The approved internal registry (RS-19) is still to be
# provided by IT; until then the official Docker Hub images are used.
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# npm ci installs exactly what the lockfile pins (integrity-checked); lifecycle scripts stay off (.npmrc).
# Behind a TLS-inspecting proxy (Zscaler) the corporate root CA is mounted as an optional build secret:
# it exists only during this step and never lands in an image layer. TLS verification stays on.
RUN --mount=type=secret,id=corporate_ca,required=false     if [ -s /run/secrets/corporate_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/corporate_ca; fi;     npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
