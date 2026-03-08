const whatsappService = require('../services/whatsapp.service');

const getStatus = async (req, res) => {
  const isReady = whatsappService.isReady();
  const latestQR = whatsappService.getLatestQR();

  res.status(200).json({
    success: true,
    data: {
      ready: isReady,
      qrAvailable: !!latestQR,
      authenticated: isReady, // simplified for now
    },
  });
};

module.exports = {
  getStatus,
};
