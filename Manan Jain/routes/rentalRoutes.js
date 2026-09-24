const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const authenticate = require('../middleware/auth');

// All rental endpoints are protected by auth middleware
router.post('/', authenticate, rentalController.createRental);
router.get('/my-bookings', authenticate, rentalController.getMyBookings);
router.patch('/:id/cancel', authenticate, rentalController.cancelRental);
router.patch('/:id/complete', authenticate, rentalController.completeRental);

module.exports = router;
