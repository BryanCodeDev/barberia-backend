FROM node:18-alpine

WORKDIR /app

RUN mkdir -p logs

COPY package.json package-lock.json ./
RUN npm ci --only=production

RUN npm install -g pm2

COPY src/ ./src/
COPY database/ ./database/
COPY scripts/ ./scripts/
COPY ecosystem.config.js ./

EXPOSE 3001

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["pm2-runtime", "start", "ecosystem.config.js"]