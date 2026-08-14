FROM node:18-slim

WORKDIR /app

RUN mkdir -p logs

COPY package*.json ./
RUN npm install --only=production

COPY src/ ./src/
COPY database/ ./database/
COPY scripts/ ./scripts/
COPY ecosystem.config.js ./

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3001) + '/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
