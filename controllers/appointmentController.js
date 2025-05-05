// controllers/appointmentController.js
const sheetService = require('../services/googleSheetService');
const { updateRowInSheet } = require('../google-sheet-utils');

// ===============================
// Utility Functions
// ===============================

/**
 * Converts Excel time format (fraction of a day) to a HH:MM string.
 * @param {number|string} time - The Excel time value.
 * @returns {string} - The formatted time string (HH:MM).
 */
function excelTimeToString(time) {
    if (typeof time !== 'number') return time;
    const totalMinutes = Math.round(time * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Formats raw doctor availability data into a more usable grouped structure.
 * Groups availability by location and excludes slots with no available weeks.
 * @param {Array<object>} raw - The raw availability data from Google Sheets.
 * @returns {object} - An object where keys are locations and values are arrays of availability slots.
 */
function formatAvailability(raw) {
    const grouped = {};
    raw.forEach(slot => {
        const weeks = [
            slot['1st Week'] ? '1st' : null,
            slot['2nd Week'] ? '2nd' : null,
            slot['3rd Week'] ? '3rd' : null,
            slot['4th Week'] ? '4th' : null,
            slot['5th Week'] ? '5th' : null,
        ].filter(Boolean);
        if (weeks.length === 0) return; // Exclude slots with no available weeks
        const location = slot['Location'];
        if (!grouped[location]) grouped[location] = [];
        grouped[location].push({
            day: slot['Day'],
            start: excelTimeToString(slot['Start Time']),
            end: excelTimeToString(slot['End Time']),
            weeks
        });
    });
    return grouped;
}

// ===============================
// Appointment Controllers
// ===============================

/**
 * Handles the retrieval of all clinic locations.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
async function getClinics(req, res) {
    try {
      const visitReason = req.query.visit_reason; // Extract visit_reason from query
      if (visitReason) {
        // Pass visitReason to the service function
        const clinics = await sheetService.getAllClinicLocations(visitReason);
        res.json({ clinics });
      } else {
        // Handle the case where visit_reason is not provided
        const clinics = await sheetService.getAllClinicLocations(''); // Or some default value
        res.json({ clinics });
        //res.status(400).json({ error: 'visit_reason parameter is required', status: 'error' }); //alternative
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch clinics', status: 'error' });
    }
  }

/**
 * Handles the retrieval of doctors by a specific location.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
async function getDoctorsByLocation(req, res) {
    try {
        const location = req.query.location;
        const doctors = await sheetService.getAllDoctors(location);
        res.json({ doctors });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch doctors', status: 'error' });
    }
}

/**
 * Handles the retrieval of a specific doctor's availability.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
async function getDoctorAvailabilities(req, res) {
    try {
        const doctorName = req.params.name || req.query.name;
        if (!doctorName) {
            return res.status(400).json({ error: 'Doctor name required', status: 'error' });
        }
        const raw = await sheetService.getDoctorAvailability(doctorName);
        const availability = formatAvailability(raw);
        res.json({ availability });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch availability', status: 'error' });
    }
}

/**
 * Handles the creation of a new appointment.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
async function createAppointment(req, res) {
    try {
        const appointment = req.body;
        const requiredFields = ['doctor', 'clinic_location', 'patient_name', 'contact_number', 'appointment_time', 'date'];
        for (const field of requiredFields) {
            if (!appointment[field]) {
                return res.status(400).json({ error: `${field} is required`, status: 'error' });
            }
        }
        const result = await sheetService.appendAppointment(appointment);
        res.status(200).json(result); // Use 200 for successful creation
    } catch (err) {
        if (err.message === 'Appointment slot already taken') {
            return res.status(409).json({ error: 'Appointment slot already taken', status: 'error' });
        }
        res.status(500).json({ error: 'Failed to create appointment', status: 'error' });
    }
}

/**
 * Handles the rescheduling of an existing appointment.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
async function rescheduleAppointment(req, res) {
    try {
        const { id } = req.params;
        const appointment_id = id;
        const updateData = req.body;

        if (!appointment_id) {
            return res.status(400).json({ error: 'Appointment ID is required', status: 'error' });
        }
        if (!updateData.appointment_time || !updateData.date) { // Ensure both are required for reschedule
            return res.status(400).json({ error: 'New appointment time and date are required', status: 'error' });
        }

        const result = await sheetService.updateAppointment(appointment_id, updateData);
        res.json(result);
    } catch (err) {
        if (err.message === 'New appointment slot already taken') {
            return res.status(409).json({ error: 'New appointment slot already taken', status: 'error' });
        } else if (err.message === 'Appointment not found') {
            return res.status(404).json({ error: 'Appointment not found', status: 'error' });
        }
        res.status(500).json({ error: 'Failed to reschedule appointment', status: 'error' });
    }
}

/**
 * Handles the cancellation of an appointment.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
async function cancelAppointment(req, res) {
    try {
        const appointment_id = req.params.id || req.query.appointment_id;
        if (!appointment_id) {
            return res.status(400).json({ error: 'Appointment ID is required', status: 'error' });
        }
        await sheetService.deleteAppointment(appointment_id);
        res.json({ message: 'Appointment cancelled successfully' });
    } catch (err) {
        console.error('[Controller] Error cancelling appointment:', err);
        if (err.message === 'Appointment not found') {
            return res.status(404).json({ error: 'Appointment not found', status: 'error' });
        }
        res.status(500).json({ error: 'Failed to cancel appointment', status: 'error' });
    }
}

/**
 * Handles the retrieval of a specific appointment by its ID.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
async function getAppointmentById(req, res) {
    try {
        const appointment_id = req.params.id || req.query.appointment_id;
        if (!appointment_id) {
            return res.status(400).json({ error: 'Appointment ID is required', status: 'error' });
        }
        const appointment = await sheetService.getAppointmentById(appointment_id);
        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found', status: 'error' });
        }
        res.json({ appointment });
    } catch (err) {
        console.error('[Controller] Error fetching appointment:', err);
        res.status(500).json({ error: 'Failed to fetch appointment', status: 'error' });
    }
}

/**
 * Handles the retrieval of all appointments (if this functionality is needed).
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
async function getAllAppointments(req, res) {
    try {
        const appointments = await sheetService.getAppointments();
        res.json({ appointments });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch appointments', status: 'error' });
    }
}

// ===============================
// Module Exports
// ===============================

module.exports = {
    getClinics,
    getDoctorsByLocation,
    getDoctorAvailabilities,
    createAppointment,
    rescheduleAppointment,
    cancelAppointment,
    getAppointmentById,
    getAllAppointments,
    updateRowInSheet // Exported from the service layer, consider its placement
};