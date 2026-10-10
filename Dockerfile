FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY backend backend
COPY frontend frontend
ENV NODE_ENV=production PORT=5050
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:5050/api/health || exit 1
CMD ["node", "backend/server.js"]
