FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /opt/actual-simplefin-sync
COPY . .
RUN npm install

CMD ["node", "app.js"]
