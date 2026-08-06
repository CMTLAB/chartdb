FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY convert-bundle.mjs preserve-layout.mjs ./

EXPOSE 8788

CMD ["node", "src/server.mjs"]
