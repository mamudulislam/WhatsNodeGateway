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

const socketHandler = require('./sockets/socket.handler');
whatsappService.setSocketIO(io);
socketHandler(io, whatsappService);

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  logger.info(`Server is running on port ${PORT}`);

  try {
      // Initialize Database
      await initializeDb();
      
      // Initialize WhatsApp Service
      // We wrap it in a non-blocking catch to prevent the entire app from crashing on start if Puppeteer is slow
      whatsappService.initialize().catch(err => {
         logger.error('Initial WhatsApp service boot failed, will retry or wait for triggers:', err);
      });
  } catch (err) {
      logger.error('Failed to initialize critical application services:', err);
      // We only exit if the DATABASE fails, not just WhatsApp
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
