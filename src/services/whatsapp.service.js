const { Client, LocalAuth } = require('whatsapp-web.js');
const { default: PQueue } = require('p-queue');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const logger = require('../config/logger');
const { getDb } = require('../config/database');

// Detection for Serverless (Vercel/AWS Lambda)
const isServerless = !!(process.env.VERCEL || process.env.LAMBDA_TASK_ROOT);
let chromium = null;
if (isServerless) {
  try {
    chromium = require('@sparticuz/chromium');
  } catch (e) {
    logger.warn('Serverless environment detected but @sparticuz/chromium not found.');
  }
}

class WhatsAppService {
  constructor() {
    this.queue = new PQueue({ concurrency: 1 });
    this.io = null;
    this.latestQR = null;
    this.client = null;
    this.isReinitializing = false;

    this.initPromise = null;

    // Don't auto-start in serverless to prevent cold-start timeout
    if (!isServerless) {
      this.createClient();
    }
    
    // Auto-restart if memory is too high (protection for 512MB limit)
    setInterval(() => {
      const used = process.memoryUsage ? process.memoryUsage().rss / 1024 / 1024 : 0;
      if (!used) return; // Fallback if memoryUsage is missing

      // On Render 512MB limit, we must be strict. Leave room for Chromium.
      const limit = process.env.RENDER ? 350 : 450;
      if (used > limit && !this.isReinitializing && this.client) {
        logger.warn(`Memory usage critical (${Math.round(used)}MB). Triggering preventive restart...`);
        this.reinitialize();
      }
    }, 60000); // Check every minute
  }

  async createClient() {
    if (this.client) {
      this.client.removeAllListeners();
      try {
        await this.client.destroy();
      } catch (e) {}
    }

    const authPath = isServerless ? '/tmp/.wwebjs_auth' : undefined;

    let executablePath = undefined;
    let headless = true; // Always headless for integration consistency
    let launchArgs = [
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
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-breakpad',
      '--disable-hang-monitor',
      '--disable-client-side-phishing-detection',
      '--disable-default-cookie-security',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--single-process',
      '--disable-web-security',
      '--disable-webgl',
      '--js-flags="--max-old-space-size=256"'
    ];

    if (!isServerless) {
      launchArgs.push('--start-maximized');
    }

    if (isServerless && chromium) {
      executablePath = await chromium.executablePath();
      headless = chromium.headless;
      launchArgs = [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'];
    }

    const puppeteerOptions = {
      headless: headless,
      executablePath: executablePath,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      launchTimeout: 120000, 
      timeout: 120000,       
      args: launchArgs,
      defaultViewport: null,
      dumpio: false,
      ignoreDefaultArgs: ['--enable-automation']
    };

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: authPath }),
      authTimeoutMs: 120000, 
      qrMaxRetries: 10,
      restartOnAuthFail: true,
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1012170943-alpha.html', // Use a newer version
      },
      puppeteer: puppeteerOptions
    });

    this.setupListeners();
  }

  setupListeners() {
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

    this.client.on('disconnected', async (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
      this.latestQR = null;
      if (this.io) {
        this.io.emit('disconnected', { reason });
      }
      
      // Clear auth folder if disconnected due to unpair/logout
      // This ensures we get a newline QR
      if (reason === 'NAVIGATION' || reason === 'LOGOUT') {
         logger.info('Performing session cleanup after logout...');
      }

      await this.reinitialize();
    });
  }

  setSocketIO(io) {
    this.io = io;
  }

  async initialize(retryCount = 0) {
    if (this.initPromise && retryCount === 0) return this.initPromise;

    const MAX_RETRIES = 3;

    this.initPromise = (async () => {
      try {
        if (!this.client) await this.createClient();
        
        if (isServerless) {
          logger.info('Vercel detected. Service will boot but may go offline soon due to serverless timeouts.');
        }

        logger.info(`Initializing WhatsApp client (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);
        await this.client.initialize();
      } catch (err) {
        logger.error(`Error initializing WhatsApp client (Attempt ${retryCount + 1}):`, err.message);
        
        if (retryCount < MAX_RETRIES) {
          logger.info(`Retrying initialization in 10 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          this.initPromise = null; // Reset for retry
          return this.initialize(retryCount + 1);
        }
        
        this.initPromise = null; // Allow manual retry later
        throw err;
      }
    })();

    return this.initPromise;
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
    await this.createClient();
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
