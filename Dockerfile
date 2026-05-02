FROM node:18-alpine

# Install Docker CLI so the worker can spawn containers via the host socket
RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/

CMD ["node", "src/worker.js"]
