# AllianceTel web app: build Angular, serve it with nginx (which also forwards /api to the backend).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/scheduling-software-frontend/browser /usr/share/nginx/html
# Where the API runs; docker-compose.yml sets this to the backend service.
ENV BACKEND_URL=http://backend:8080
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
