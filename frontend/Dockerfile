FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE_URL=/api
ARG VITE_DASHBOARD_HEARTBEAT_MS=10000
ARG VITE_APP_VERSION=1.0.0
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_DASHBOARD_HEARTBEAT_MS=${VITE_DASHBOARD_HEARTBEAT_MS}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
