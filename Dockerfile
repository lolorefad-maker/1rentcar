FROM node:20-alpine

WORKDIR /app

# sqlite3 is compiled from source on Alpine.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
# Keep the database and uploaded photos on a mounted volume, not inside the image.
ENV DB_PATH=/data/showroom.db
VOLUME ["/data", "/app/public/uploads"]

EXPOSE 3000
CMD ["node", "server/index.js"]
