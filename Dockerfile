# AllianceTel web app: build Angular, serve it with nginx (which also forwards /api to the backend).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.30-alpine
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/scheduling-software-frontend/browser /usr/share/nginx/html
# PORT: Railway sets its own; 80 elsewhere.
# BACKEND_URL: docker-compose.yml uses the "backend" service; on Railway set it to the backend's private domain.
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS: makes the nginx image detect this container's DNS server for the resolver line.
ENV PORT=80 \
    BACKEND_URL=http://backend:8080 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
