FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build
ENTRYPOINT ["node", "dist/src/cli.js"]
