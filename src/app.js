const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./config/logger');
const errorHandler = require('./middlewares/error');
const apiLimiter = require('./middlewares/rateLimiter');
const messageRoutes = require('./routes/message.routes');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Logging middleware
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Serve static files for simple demo UI
app.use(express.static('public'));

// Rate limiter for API
app.use('/api', apiLimiter);

// Routes
app.use('/api/messages', messageRoutes);

// Custom error handling
app.use(errorHandler);

module.exports = app;
