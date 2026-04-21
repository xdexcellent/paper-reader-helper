FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
