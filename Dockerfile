FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg libsodium-dev libopus-dev build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

CMD ["npm", "run", "start"]
