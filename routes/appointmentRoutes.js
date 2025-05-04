const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const sheetService = require('../services/googleSheetService');

console.log('[google-sheet-utils] Module loaded');
console.log('[appointmentController] Module loaded');

// Get all clinics
router.get('/appointment', (req, res) => {
    const { task } = req.query;
    if (task === 'get_clinics') {
        appointmentController.getClinics(req, res);
    } else if (task === 'get_doctors_by_location') {
        appointmentController.getDoctorsByLocation(req, res);
    } else if (task === 'get_doctors_availabilities') {
        appointmentController.getDoctorAvailabilities(req, res);
    } else if (task === 'appointment_save') {
        appointmentController.createAppointment(req, res);
    } else if (task === 'appointment_reschedule') {
        appointmentController.rescheduleAppointment(req, res);
    } else if (task === 'appointment_cancel') {
        appointmentController.cancelAppointment(req, res);
    } else if (task === 'appointment_fetch') {
        appointmentController.getAppointmentById(req, res);
    } else {
        res.status(400).json({ error: 'Invalid task', status: 'error' });
    }
});

// This will handle POST requests for appointment_save
router.post('/appointment', (req, res) => {
    const { task } = req.query;
    if (task === 'appointment_save') {
        appointmentController.createAppointment(req, res);
    } else {
        res.status(400).json({ error: 'Invalid task', status: 'error' });
    }
});

// (Stubs for remaining endpoints)
router.put('/appointments/:id', appointmentController.rescheduleAppointment);
router.delete('/appointments/:id', async (req, res) => {
    try {
        console.log('Cancel request params:', req.params);
        const { id } = req.params;
        const appointment_id = id;
        console.log('[Controller] About to call deleteAppointment with:', appointment_id);
        const startIndex = rowId + 2;
        await sheetService.deleteAppointment(appointment_id);
        res.json({ message: 'Appointment cancelled successfully' });
    } catch (err) {
        console.error('[Controller] Error cancelling appointment:', err);
        res.status(500).json({ error: 'Failed to cancel appointment', status: 'error' });
    }
});
router.get('/appointments/:id', appointmentController.getAppointmentById);

module.exports = router; 