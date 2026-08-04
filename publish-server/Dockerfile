FROM node:24-alpine
WORKDIR /app
COPY server.mjs convert-bundle.mjs preserve-layout.mjs ./
EXPOSE 8788
CMD ["node", "server.mjs"]
