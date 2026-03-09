FROM node:18-bullseye-slim

# Install necessary libraries for Puppeteer/Chromium and build tools for sqlite3
RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils \
  libxkbcommon0 \
  libxkbcommon-x11-0 \
  libxshmfence1 \
  # Build tools for npm dependencies (like sqlite3)
  python3 \
  make \
  g++ \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Create a non-root user and set permissions
RUN useradd --user-group --create-home appuser
WORKDIR /usr/src/app

# Pre-create data directories and database file with proper permissions
RUN mkdir -p logs .wwebjs_auth .wwebjs_cache \
  && touch database.sqlite \
  && chown -R appuser:appuser /usr/src/app

# Switch to non-root user
USER appuser

# Copy package.json & install dependencies
COPY --chown=appuser:appuser package*.json ./
RUN npm install

# Copy app source
COPY --chown=appuser:appuser . .

# Set default concurrency to 1 to save resources on Render
ENV WEB_CONCURRENCY=1

# Volume for data persistence (if using volumes)
VOLUME ["/usr/src/app/logs", "/usr/src/app/.wwebjs_auth", "/usr/src/app/database.sqlite"]

# Expose port and start app
EXPOSE 3000
CMD ["node", "--max-old-space-size=350", "src/server.js"]