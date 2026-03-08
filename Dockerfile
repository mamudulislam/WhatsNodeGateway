# ============ BASE IMAGE ============
FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies including Node.js 22 LTS
RUN apt-get update && apt-get install -y \
  # basic tools
  curl gnupg ca-certificates wget xdg-utils \
  # Puppeteer/Chromium libs
  fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \
  libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
  libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
  build-essential \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Install Node.js 22.x (Active LTS as of 2026)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
  apt-get install -y nodejs && \
  rm -rf /var/lib/apt/lists/*

# Create app directory and use a non-root user
WORKDIR /usr/src/app
RUN useradd --create-home appuser
USER appuser

# Copy package files & install dependencies separately to use Docker cache better
COPY --chown=appuser:appuser package*.json ./
RUN npm install

# Copy application source
COPY --chown=appuser:appuser . .

# Expose the app port
EXPOSE 3000

# Run the app
CMD ["npm", "start"]