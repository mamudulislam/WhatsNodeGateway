const whatsappService = require('../services/whatsapp.service');
const logger = require('../config/logger');
const { getDb } = require('../config/database');

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

const getLogs = async (req, res, next) => {
  try {
    const db = getDb();
    const logs = await db.all('SELECT * FROM message_logs ORDER BY timestamp DESC LIMIT 50');
    
    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    logger.error('Error fetching message logs:', error);
    next(error);
  }
};

module.exports = {
  sendMessage,
  getLogs
};
