FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY nhs-data.db ./
ENV TRANSPORT=http
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
