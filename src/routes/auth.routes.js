const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.get('/status', authController.getStatus);

module.exports = router;
