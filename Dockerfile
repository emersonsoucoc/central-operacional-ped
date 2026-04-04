FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY index.html app.css app.js server.js ./
RUN mkdir -p dist && cp index.html app.css app.js dist/
EXPOSE 3000
CMD ["node", "server.js"]
