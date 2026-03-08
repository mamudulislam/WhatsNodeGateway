const whatsappService = require('../services/whatsapp.service');
const logger = require('../config/logger');

const sendMessage = async (req, res, next) => {
  try {
    const { phone, message } = req.body;
    
    // Add task to whatsapp service queue
    const result = await whatsappService.sendMessage(phone, message);
    
    res.status(200).json({
      success: true,
      message: 'Message sent successfully.',
      data: result,
    });
  } catch (error) {
    logger.error('Error sending message via controller:', error);
    next(error);
  }
};

module.exports = {
  sendMessage,
};
