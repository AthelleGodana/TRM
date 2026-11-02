FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save prisma@5.22.0
COPY prisma ./prisma
RUN npx prisma generate
COPY scripts ./scripts
COPY src ./src

USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply migrations and (re)create the database roles, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/setup-db-roles.js && node src/index.js"]
