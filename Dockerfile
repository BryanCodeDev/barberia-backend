FROM node:18-alpine

WORKDIR /app

RUN mkdir -p logs

COPY package.json ./
RUN npm install --only=production

COPY src/ ./src/
COPY database/ ./database/
COPY scripts/ ./scripts/
COPY ecosystem.config.js ./

EXPOSE 3001

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
