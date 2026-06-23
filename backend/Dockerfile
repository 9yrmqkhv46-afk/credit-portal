# ---------------------------------------------------------------------------
# Backend Dockerfile - Express + Prisma API (PostgreSQL in production)
# Build:  docker build -t transformbiz-backend ./backend
# Run:    docker run -p 3001:3001 \
#           -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
#           -e JWT_SECRET="$(openssl rand -base64 32)" \
#           -e FRONTEND_URL="https://your-frontend-domain" \
#           -e NODE_ENV=production \
#           transformbiz-backend
# ---------------------------------------------------------------------------
FROM node:22-slim

WORKDIR /app

# OpenSSL is required by the Prisma engines; build tools cover any native deps.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first to leverage Docker layer caching.
COPY package*.json ./
RUN npm install

# Copy the rest of the source.
COPY . .

# Generate the Prisma client against the PostgreSQL schema and compile to dist/.
RUN npm run build:prod

ENV NODE_ENV=production
EXPOSE 3001

# On boot: sync the schema to PostgreSQL (prisma db push) then start the server.
CMD ["npm", "run", "start:prod"]
