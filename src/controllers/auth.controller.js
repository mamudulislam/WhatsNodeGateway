const whatsappService = require('../services/whatsapp.service');

const getStatus = async (req, res) => {
  const isReady = whatsappService.isReady();
  const latestQR = whatsappService.getLatestQR();

  const qrUrl = latestQR ? await require('qrcode').toDataURL(latestQR) : null;

  res.status(200).json({
    success: true,
    data: {
      ready: isReady,
      qrAvailable: !!latestQR,
      qrUrl: qrUrl,
      authenticated: isReady,
    },
  });
};

module.exports = {
  getStatus,
};
