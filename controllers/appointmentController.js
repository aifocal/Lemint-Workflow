// controllers/appointmentController.js
const sheetService = require('../services/googleSheetService');
const { updateRowInSheet } = require('../google-sheet-utils');

function excelTimeToString(time) {
  if (typeof time !== 'number') return time;
  const totalMinutes = Math.round(time * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatAvailability(raw) {
  // Group by location and exclude slots with empty weeks
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

module.exports = {
  getClinics: async (req, res) => {
    try {
      const clinics = await sheetService.getAllClinicLocations();
      res.json({ clinics });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch clinics', status: 'error' });
    }
  },
  
  getDoctorsByLocation: async (req, res) => {
    try {
      const location = req.query.location;
      const doctors = await sheetService.getAllDoctors(location);
      res.json({ doctors });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch doctors', status: 'error' });
    }
  },
  
  getDoctorAvailabilities: async (req, res) => {
    try {
      const doctorName = req.params.name || req.query.name;
      if (!doctorName) return res.status(400).json({ error: 'Doctor name required', status: 'error' });
      const raw = await sheetService.getDoctorAvailability(doctorName);
      const availability = formatAvailability(raw);
      res.json({ availability });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch availability', status: 'error' });
    }
  },
  
  createAppointment: async (req, res) => {
    try {
      const appointment = req.body;
      // Validate required fields
      const requiredFields = ['doctor', 'clinic_location', 'patient_name', 'contact_number', 'appointment_time', 'date'];
      for (const field of requiredFields) {
        if (!appointment[field]) {
          return res.status(400).json({ error: `${field} is required`, status: 'error' });
        }
      }
      // Use the new Google Sheets API logic
      const result = await sheetService.appendAppointment(appointment);
      res.json(result);
    } catch (err) {
      if (err.message === 'Appointment slot already taken') {
        return res.status(409).json({ error: 'Appointment slot already taken', status: 'error' });
      }
      res.status(500).json({ error: 'Failed to create appointment', status: 'error' });
    }
  },
  
  rescheduleAppointment: async (req, res) => {
    try {
      console.log('Reschedule request params:', req.params, 'body:', req.body);
      const { id } = req.params;
      const appointment_id = id;
      const updateData = req.body;
      
      if (!appointment_id) {
        return res.status(400).json({ error: 'Appointment ID is required', status: 'error' });
      }
      
      if (!updateData.appointment_time) {
        return res.status(400).json({ error: 'New appointment time is required', status: 'error' });
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
  },
  
  cancelAppointment: async (req, res) => {
    try {
      const appointment_id = req.params.id || req.query.appointment_id;
      console.log('Cancel request params:', req.params, 'query:', req.query, 'using id:', appointment_id);
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
  },
  
  getAppointmentById: async (req, res) => {
    try {
      const appointment_id = req.params.id || req.query.appointment_id;
      console.log('Get by ID request params:', req.params, 'query:', req.query, 'using id:', appointment_id);
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
  },
  
  getAllAppointments: async (req, res) => {
    try {
      const appointments = await sheetService.getAppointments();
      res.json({ appointments });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch appointments', status: 'error' });
    }
  },
  
  updateRowInSheet
};