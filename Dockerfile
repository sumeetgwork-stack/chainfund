FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install
RUN cd backend && npm install

# Copy application code
COPY . .

# Compile Solidity contracts
RUN npm run compile

# Expose port
EXPOSE 5000

# Start backend
CMD ["npm", "run", "backend"]
