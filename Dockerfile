# ==========================================================================
# ORTHOFIX SPECIALITY CLINIC — PRODUCTION DOCKER CONTAINER
# ==========================================================================

FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package definition files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application backend and frontend files
COPY backend ./backend
COPY frontend ./frontend

# Create persistent directory for SQLite database
RUN mkdir -p database

# Expose server port
EXPOSE 5000

# Environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/auth/login || exit 1

# Command to run application
CMD ["node", "backend/server.js"]
