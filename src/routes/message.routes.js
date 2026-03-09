const express = require('express');
const Joi = require('joi');
const messageController = require('../controllers/message.controller');
const validate = require('../middlewares/validate');

const router = express.Router();

const messageSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      'string.pattern.base': '"phone" must contain only numeric characters',
    }),
  message: Joi.string().min(1).required(),
});

router.post(
  '/send',
  validate(messageSchema),
  messageController.sendMessage
);

router.get('/logs', messageController.getLogs);

module.exports = router;
