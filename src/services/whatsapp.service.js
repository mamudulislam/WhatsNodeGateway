const { Client, LocalAuth } = require('whatsapp-web.js');
const { default: PQueue } = require('p-queue');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const logger = require('../config/logger');
const { getDb } = require('../config/database');

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
      // On Render 512MB limit, we must be strict. Leave room for Chromium.
      const limit = process.env.RENDER ? 350 : 450;
      if (used > limit && !this.isReinitializing) {
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
        // Remove hardcoded Windows path to prevent crash on Render/Linux
        executablePath: process.env.RENDER || process.env.NODE_ENV === 'production' 
          ? null // Let Puppeteer use its downloaded Chromium on Render
          : undefined, // Let Puppeteer use its downloaded Chromium locally or fallback to default
        launchTimeout: 120000,
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
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--js-flags="--max-old-space-size=128"',
          '--disable-canvas-aa',
          '--disable-2d-canvas-clip-aa',
          '--disable-gl-drawing-for-tests',
          '--no-startup-window'
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
      logger.error('Error initializing WhatsApp client:', err);
      throw err; // Re-throw so the server knows it failed
    });
  }

  async reinitialize() {
    if (this.isReinitializing) return;
    this.isReinitializing = true;

    try {
      if (this.client) {
        logger.info('Shutting down previous WhatsApp client...');
        await this.client.destroy().catch(err => {
            if (!err.message.includes('Target closed') && !err.message.includes('Execution context was destroyed')) {
                logger.error('Error during client destruction:', err);
            }
        });
      }
    } catch (err) {
      logger.error('Unexpected error in reinitialize cleanup:', err);
    }
    
    logger.info('Starting fresh WhatsApp client...');
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

      try {
        const isRegistered = await this.client.isRegisteredUser(chatId).catch(err => {
          if (err.message && err.message.length === 1 && err.message === 't') {
              throw new Error('Internal WhatsApp-Web error (t). Session may be in unstable state. Refresh recommended.');
          }
          throw err;
        });
        if (!isRegistered) {
           throw new Error('The phone number is not registered on WhatsApp.');
        }

        await this.client.sendMessage(chatId, message);
        logger.info(`Message successfully sent to ${to}`);
        
        // Log successful message to database
        const db = getDb();
        await db.run(
          'INSERT INTO message_logs (phone, message, status) VALUES (?, ?, ?)',
          [to, message, 'sent']
        );

        return { success: true, to, message };
      } catch (err) {
        // Log failed message to database
        try {
          const db = getDb();
          await db.run(
            'INSERT INTO message_logs (phone, message, status, error) VALUES (?, ?, ?, ?)',
            [to, message, 'failed', err.message]
          );
        } catch (dbErr) {
          logger.error('CRITICAL: Failed to log error to database:', dbErr);
        }
        throw err;
      }
    });
  }

  async logout() {
    try {
      if (!this.client || !this.isReady()) {
         return { success: false, message: 'No active session to log out from.' };
      }

      logger.info('Performing official logout from active WhatsApp session...');
      await this.client.logout().catch(err => {
          logger.warn('Official logout encounterd an error, forcing system reset.');
      });

      // After successful logout or attempt, start fresh for next user
      await this.reinitialize();
      return { success: true, message: 'Successfully logged out and session cleared.' };
    } catch (err) {
      logger.error('Unexpected error during logout process:', err);
      return { success: false, message: 'Failed to complete logout properly.' };
    }
  }
}

// Export a singleton instance
module.exports = new WhatsAppService();
