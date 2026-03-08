const { Client, LocalAuth } = require('whatsapp-web.js');
const { default: PQueue } = require('p-queue');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const logger = require('../config/logger');

class WhatsAppService {
  constructor() {
    this.queue = new PQueue({ concurrency: 1 });
    this.io = null;
    this.latestQR = null;
    this.client = null;
    this.isReinitializing = false;

    this.createClient();
    
    // Auto-restart if memory is too high (protection for 512MB limit)
    setInterval(() => {
      const used = process.memoryUsage().rss / 1024 / 1024;
      if (used > 450 && !this.isReinitializing) {
        logger.warn(`Memory usage critical (${Math.round(used)}MB). Triggering preventive restart...`);
        this.reinitialize();
      }
    }, 60000); // Check every minute
  }

  createClient() {
    if (this.client) {
      this.client.removeAllListeners();
    }

    this.client = new Client({
      authStrategy: new LocalAuth(),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      },
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-sync',
          '--no-pings',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-translate',
          '--metrics-recording-only',
          '--mute-audio',
          '--safebrowsing-disable-auto-update',
          '--hide-scrollbars',
          '--disable-infobars',
          '--disable-notifications',
          '--disable-logging',
          '--ignore-certificate-errors',
          '--single-process'
        ]
      }
    });

    this.client.on('qr', async (qr) => {
      logger.info('QR Code received. Please scan to authenticate.');
      qrcodeTerminal.generate(qr, { small: true });
      this.latestQR = qr;
      if (this.io) {
        try {
          const qrDataURL = await qrcode.toDataURL(qr);
          this.io.emit('qr', { raw: qr, url: qrDataURL });
        } catch (err) {
          logger.error('Failed to generate QR data URL on backend', err);
          this.io.emit('qr', { raw: qr });
        }
      }
    });

    this.client.on('ready', () => {
      logger.info('WhatsApp client is ready!');
      if (this.io) {
        this.io.emit('ready', { message: 'WhatsApp client is ready!' });
      }
    });

    this.client.on('authenticated', () => {
      logger.info('WhatsApp client authenticated.');
      this.latestQR = null;
      if (this.io) {
        this.io.emit('authenticated', { message: 'WhatsApp client authenticated.' });
      }
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('WhatsApp auth failure:', msg);
      if (this.io) {
        this.io.emit('auth_failure', { message: msg });
      }
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
      if (this.io) {
        this.io.emit('disconnected', { reason });
      }
      this.reinitialize();
    });
  }

  setSocketIO(io) {
    this.io = io;
  }

  initialize() {
    if (!this.client) this.createClient();
    return this.client.initialize().catch((err) => {
      logger.error('Error initializing WhatsApp client', err);
    });
  }

  async reinitialize() {
    if (this.isReinitializing) return;
    this.isReinitializing = true;

    try {
      logger.info('Destroying client for reinitialization...');
      await this.client.destroy();
    } catch (err) {
      logger.error('Error destroying client:', err);
    }
    
    logger.info('Recreating client and initializing...');
    this.createClient();
    this.initialize().finally(() => {
      this.isReinitializing = false;
    });
  }

  isReady() {
    return this.client && this.client.info !== undefined;
  }

  getLatestQR() {
    return this.latestQR;
  }

  async sendMessage(to, message) {
    return this.queue.add(async () => {
      if (!this.isReady()) {
        throw new Error('WhatsApp client is not ready.');
      }
      
      const sanitizedNumber = to.replace(/[^0-9]/g, '');
      const chatId = `${sanitizedNumber}@c.us`;

      const isRegistered = await this.client.isRegisteredUser(chatId);
      if (!isRegistered) {
         throw new Error('The phone number is not registered on WhatsApp.');
      }

      await this.client.sendMessage(chatId, message);
      logger.info(`Message successfully sent to ${to}`);
      return { success: true, to, message };
    });
  }

  async logout() {
    if (!this.client) {
      throw new Error('WhatsApp client is not initialized.');
    }

    try {
      logger.info('Logging out from WhatsApp...');
      await this.client.logout();
      logger.info('Logout successful.');
      // Reinitialize to allow scanning a new QR code
      await this.reinitialize();
      return { success: true, message: 'Successfully logged out and reinitialized.' };
    } catch (err) {
      logger.error('Error during WhatsApp logout:', err);
      // Even if logout fails, we might want to destroy and recreate the client
      await this.reinitialize();
      throw err;
    }
  }
}

// Export a singleton instance
module.exports = new WhatsAppService();
