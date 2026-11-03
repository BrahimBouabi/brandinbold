FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npx esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs --external:pg

EXPOSE 8787
# migrations run at boot (idempotent DDL in index.ts)
CMD ["node", "dist/index.cjs"]
