const { Client, LocalAuth } = require('whatsapp-web.js');
const { default: PQueue } = require('p-queue');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const logger = require('../config/logger');

class WhatsAppService {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.queue = new PQueue({ concurrency: 1 });
    this.io = null;
    this.latestQR = null;

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
      this.latestQR = null; // Clear QR code on auth
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
      // Attempt to reinitialize on disconnect
      this.reinitialize();
    });
  }

  setSocketIO(io) {
    this.io = io;
  }

  initialize() {
    return this.client.initialize().catch((err) => {
      logger.error('Error initializing WhatsApp client', err);
    });
  }

  async reinitialize() {
    try {
      logger.info('Destroying client explicitly...');
      await this.client.destroy();
    } catch (err) {
      logger.error('Error destroying client:', err);
    }
    
    logger.info('Reinitializing client...');
    this.initialize();
  }

  isReady() {
    return this.client.info !== undefined;
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

      // Check if number is registered (optional but recommended to avoid issues)
      const isRegistered = await this.client.isRegisteredUser(chatId);
      if (!isRegistered) {
         throw new Error('The phone number is not registered on WhatsApp.');
      }

      await this.client.sendMessage(chatId, message);
      logger.info(`Message successfully sent to ${to}`);
      return { success: true, to, message };
    });
  }
}

// Export a singleton instance
module.exports = new WhatsAppService();
