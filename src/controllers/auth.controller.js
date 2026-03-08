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

const logout = async (req, res) => {
  try {
    const result = await whatsappService.logout();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to log out.',
      error: err.message,
    });
  }
};

module.exports = {
  getStatus,
  logout,
};
