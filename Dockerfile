FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY index.html app.css app.js ./
RUN mkdir -p dist && cp index.html app.css app.js dist/
EXPOSE 3000
CMD ["sh", "-c", "npx serve dist --listen ${PORT:-3000}"]
