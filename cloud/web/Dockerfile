FROM node:22-alpine AS build
WORKDIR /app
# Public API URL, baked into the bundle at build time (Railway passes service
# variables as build args automatically).
ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# templates/*.template are envsubst-rendered into conf.d at startup; only
# PORT is substituted so nginx's own $uri variables stay intact.
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV PORT=80
ENV NGINX_ENVSUBST_FILTER=^PORT$
EXPOSE 80
