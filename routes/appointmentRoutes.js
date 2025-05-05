const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const sheetService = require('../services/googleSheetService');

// ===============================
// Module Loading Confirmation
// ===============================

console.log('[appointmentController] Module loaded');

// ===============================
// Appointment Routes
// ===============================

/**
 * Route for handling appointment related requests
 * Handles GET requests with a 'task' query parameter to determine specific actions.
 */
router.get('/appointment', (req, res) => {
    const { task } = req.query;

    switch (task) {
        case 'get_clinics':
            appointmentController.getClinics(req, res);
            break;
        case 'get_doctors_by_location':
            appointmentController.getDoctorsByLocation(req, res);
            break;
        case 'get_doctors_availabilities':
            appointmentController.getDoctorAvailabilities(req, res);
            break;
        case 'appointment_save':
            appointmentController.createAppointment(req, res);
            break;
        case 'appointment_reschedule':
            appointmentController.rescheduleAppointment(req, res);
            break;
        case 'appointment_cancel':
            appointmentController.cancelAppointment(req, res);
            break;
        case 'appointment_fetch':
            appointmentController.getAppointmentById(req, res);
            break;
        default:
            res.status(400).json({ error: 'Invalid task', status: 'error' });
    }
});

/**
 * Route for handling new appointment creation
 * Handles POST requests to the /appointment endpoint
 */
router.post('/appointment', (req, res) => {
    const { task } = req.query;
    if (task === 'appointment_save') {
        appointmentController.createAppointment(req, res);
    } else {
        res.status(400).json({ error: 'Invalid task', status: 'error' });
    }
});

// ===============================
// Appointment Management Routes
// ===============================
/**
 * Route for handling appointment rescheduling.
 * Uses a PUT request to update a specific appointment by ID.
 */
router.put('/appointments/:id', appointmentController.rescheduleAppointment);

/**
 * Route for handling appointment cancellation.
 * Uses a DELETE request to remove a specific appointment by ID.
 */
router.delete('/appointments/:id', async (req, res) => {
    try {
        console.log('Cancel request params:', req.params);
        const { id } = req.params;
        const appointment_id = id;
        console.log('[Controller] About to call deleteAppointment with:', appointment_id);
        await sheetService.deleteAppointment(appointment_id);
        res.json({ message: 'Appointment cancelled successfully' });
    } catch (err) {
        console.error('[Controller] Error cancelling appointment:', err);
        res.status(500).json({ error: 'Failed to cancel appointment', status: 'error' });
    }
});

// ===============================
// Module Exports
// ===============================
module.exports = router;
