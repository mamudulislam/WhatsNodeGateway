const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;
  
  if (!statusCode) {
    statusCode = 500;
  }

  res.locals.errorMessage = err.message;

  const response = {
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  if (statusCode >= 500) {
    logger.error(`${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  }

  res.status(statusCode).send(response);
};

module.exports = errorHandler;
