const logger = require('../config/logger');
const qrcode = require('qrcode');

module.exports = (io, whatsappService) => {
  io.on('connection', (socket) => {
    logger.info(`Socket connected index.html: ${socket.id}`);

    // If already ready, inform the client
    if (whatsappService.isReady()) {
      socket.emit('ready', { message: 'WhatsApp client is ready!' });
    } else {
      // Send stored QR if available
      const latestQR = whatsappService.getLatestQR();
      if (latestQR) {
        qrcode.toDataURL(latestQR)
          .then((url) => {
            socket.emit('qr', { raw: latestQR, url });
          })
          .catch((err) => {
             logger.error('Failed to generate QR data URL for new client socket', err);
             socket.emit('qr', { raw: latestQR });
          });
      }
    }

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected index.html: ${socket.id}`);
    });
  });

  // Events emitted by the service can also be hooked here if needed,
  // but they are already being handled in whatsappService.setupListeners()
};
