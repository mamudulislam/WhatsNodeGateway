require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const whatsappService = require('./services/whatsapp.service');
const logger = require('./config/logger');
const { initializeDb } = require('./config/database');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

whatsappService.setSocketIO(io);

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // If the client is already ready, tell the new connected socket
  if (whatsappService.isReady()) {
    socket.emit('ready', { message: 'WhatsApp client is ready!' });
  } else {
    // If not ready but we have a cached QR, send it immediately
    const latestQR = whatsappService.getLatestQR();
    if (latestQR) {
      const qrcode = require('qrcode');
      qrcode.toDataURL(latestQR).then((url) => {
        socket.emit('qr', { raw: latestQR, url });
      }).catch(() => {
        socket.emit('qr', { raw: latestQR });
      });
    }
  }

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  logger.info(`Server is running on port ${PORT}`);

  try {
      // Initialize Database
      await initializeDb();
      
      // Initialize WhatsApp Service
      await whatsappService.initialize();
  } catch (err) {
      logger.error('Failed to initialize application services:', err);
      process.exit(1);
  }

  
  // Periodic memory monitoring
  setInterval(() => {
    const used = process.memoryUsage();
    logger.info(`Memory Usage: RSS: ${Math.round(used.rss / 1024 / 1024)}MB, Heap Total: ${Math.round(used.heapTotal / 1024 / 1024)}MB, Heap Used: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
  }, 5 * 60 * 1000); // Every 5 minutes
});

// Handle unhandled Promise rejections
process.on('unhandledRejection', (err) => {
  const isPuppeteerError =
    err.message && (err.message.includes('Target closed') || err.message.includes('Execution context was destroyed') || err.message.includes('detached Frame'));

  if (isPuppeteerError) {
    logger.warn('Skipping process exit for transient Puppeteer/WhatsApp error:', err.message);
  } else {
    logger.error('Unhandled Rejection! Shutting down...', err);
    server.close(() => {
      process.exit(1);
    });
  }
});

// Trigger restart
