const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.get('/status', authController.getStatus);
router.post('/logout', authController.logout);

module.exports = router;
