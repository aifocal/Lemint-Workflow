const { google } = require('googleapis');
const path = require('path');
const { updateRowInSheet, getAppointmentById, deleteAppointment } = require('../google-sheet-utils');

const KEY_FILE_PATH = path.join(__dirname, '../google.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const spreadsheetId = '1vLtvhdMnIk-iZEZWVgmFxfpzR7Hc3Gk4C0Iv9drB9tg';

async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: SCOPES,
    });
    return google.sheets({ version: 'v4', auth });
}

async function readGoogleSheet(sheetName) {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:Z100`,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];
    const headers = rows[0];
    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header.trim()] = (row[i] || '').toString().trim();
        });
        return obj;
    });
}

async function getAllClinicLocations() {
    const data = await readGoogleSheet('Doctors');
    const locations = [...new Set(data.map(row => row['Location']).filter(Boolean))];
    return locations;
}

async function getAllDoctors(location) {
    const data = await readGoogleSheet('Doctors');
    let doctors = data.map(row => row['Doctor Name']).filter(Boolean);
    if (location) {
        doctors = data.filter(row => row['Location'] === location).map(row => row['Doctor Name']);
    }
    return [...new Set(doctors)];
}

async function getDoctorAvailability(doctorName) {
    const data = await readGoogleSheet('Doctors');
    return data.filter(row => row['Doctor Name'] === doctorName);
}

async function appendPatientBooking(row) {
    console.log('Appending to Patients_Booking:', row);
    const sheets = await getSheetsClient();
    const result = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Patients_Booking!A1',
        valueInputOption: 'RAW',
        resource: { values: [row] }
    });
    console.log('Append result:', result.data);
}

async function updateMonthlyCalendar({ doctor, date, time, location, appointmentId, patientName }) {
    console.log('Updating monthly calendar:', { doctor, date, time, location, appointmentId, patientName });
    const sheets = await getSheetsClient();
    const [day, month, year] = date.split(' ');
    const monthSheet = `${month} ${year.slice(-2)}`;
    const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${monthSheet}!A1:Z100`
    });
    const values = resp.data.values;
    // Find the column for the day in the second row (values[1])
    let dayColIdx = -1;
    if (values[1]) {
        for (let j = 0; j < values[1].length; j++) {
            if (values[1][j] && values[1][j].toString().trim() === day.trim()) {
                dayColIdx = j;
                break;
            }
        }
    }
    // Find the row for the time in the first column, starting from row 3 (values[2][0], ...)
    let timeRowIdx = -1;
    for (let i = 2; i < values.length; i++) {
        if (values[i][0] && values[i][0].toString().trim() === time.trim()) {
            timeRowIdx = i;
            break;
        }
    }
    console.log('Found timeRowIdx:', timeRowIdx, 'dayColIdx:', dayColIdx);
    if (timeRowIdx !== -1 && dayColIdx !== -1) {
        const bookingText = `${location} - ${appointmentId} - ${patientName}`;
        values[timeRowIdx][dayColIdx] = bookingText;
        const updateResult = await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${monthSheet}!A1:Z100`,
            valueInputOption: 'RAW',
            resource: { values }
        });
        console.log('Calendar update result:', updateResult.data);
    } else {
        console.log('Could not find correct cell for calendar update.');
    }
}

async function appendAppointment(appointmentData) {
    try {
        const {
            doctor,
            clinic_location,
            patient_name,
            contact_number,
            visit_reason,
            appointment_time,
            date
        } = appointmentData;
        // Generate a unique appointment ID
        const appointmentId = Math.floor(Math.random() * 1e10).toString();
        // Prepare row for Patients_Booking
        const bookingRow = [
            appointmentId,
            patient_name,
            contact_number,
            visit_reason,
            doctor,
            date,
            appointment_time,
            clinic_location
        ];
        console.log('Appending to Patients_Booking:', bookingRow);
        await appendPatientBooking(bookingRow);
        await updateMonthlyCalendar({
            doctor,
            date,
            time: appointment_time,
            location: clinic_location,
            appointmentId,
            patientName: patient_name
        });
        return {
            status: 'success',
            appointment: {
                appointmentId,
                doctor,
                clinic_location,
                patient_name,
                contact_number,
                visit_reason,
                appointment_time,
                date
            }
        };
    } catch (err) {
        console.error('Error in appendAppointment:', err); // Log the error details
        throw err;
    }
}

async function updateAppointment(appointmentId, updatedData) {
    try {
        console.log('[updateAppointment] Called with:', { appointmentId, updatedData });
        const appointments = await readGoogleSheet('Patients_Booking');
        console.log('[updateAppointment] Loaded appointments:', appointments.length);
        const appointmentIndex = appointments.findIndex(app => app['Appointment ID'] === appointmentId);
        console.log('[updateAppointment] Found appointment index:', appointmentIndex);
        if (appointmentIndex === -1) {
            throw new Error('Appointment not found');
        }
        const appointment = appointments[appointmentIndex];
        // If updating appointment time or date, check if slot is available
        if (
            (updatedData.appointment_time && updatedData.appointment_time !== appointment['Time']) ||
            (updatedData.date && updatedData.date !== appointment['Date'])
        ) {
            const isSlotTaken = appointments.some(
                app =>
                    app['Appointment ID'] !== appointmentId &&
                    app['Preferred Doctor'] === appointment['Preferred Doctor'] &&
                    app['Location'] === appointment['Location'] &&
                    app['Time'] === (updatedData.appointment_time || appointment['Time']) &&
                    app['Date'] === (updatedData.date || appointment['Date'])
            );
            if (isSlotTaken) {
                throw new Error('New appointment slot already taken');
            }
        }
        // Create updated appointment object
        const updatedAppointment = {
            ...appointment,
            'Time': updatedData.appointment_time || appointment['Time'],
            'Date': updatedData.date || appointment['Date'],
            // Add other fields if you want to allow updating them
        };
        // Convert to array format for Google Sheets
        const updatedRow = [
            updatedAppointment['Appointment ID'],
            updatedAppointment['Patient Name'],
            updatedAppointment['Contact Number'],
            updatedAppointment['Reason For Visit'],
            updatedAppointment['Preferred Doctor'],
            updatedAppointment['Date'],
            updatedAppointment['Time'],
            updatedAppointment['Location']
        ];
        // Update the row in the sheet (use your updateRowInSheet or similar function)
        await updateRowInSheet('Patients_Booking', updatedRow, appointmentIndex);
        console.log('[updateAppointment] Row updated successfully.');
        return updatedAppointment;
    } catch (err) {
        console.error('[updateAppointment] Error:', err);
        throw err;
    }
}

module.exports = {
    getAllClinicLocations,
    getAllDoctors,
    getDoctorAvailability,
    appendAppointment,
    appendPatientBooking,
    updateMonthlyCalendar,
    readGoogleSheet,
    updateAppointment,
    getAppointmentById,
    deleteAppointment
}; 