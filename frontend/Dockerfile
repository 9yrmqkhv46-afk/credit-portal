# ---------------------------------------------------------------------------
# Frontend Dockerfile - Next.js app (optional alternative deploy option)
# NEXT_PUBLIC_API_URL must be provided at BUILD time (it is inlined into the
# client bundle), e.g.:
#   docker build \
#     --build-arg NEXT_PUBLIC_API_URL=https://your-backend-domain/api \
#     -t transformbiz-frontend ./frontend
#   docker run -p 3000:3000 transformbiz-frontend
# ---------------------------------------------------------------------------
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Inline the public API URL at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
