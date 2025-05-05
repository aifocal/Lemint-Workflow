const { google } = require('googleapis');
const path = require('path');
const { updateRowInSheet, getAppointmentById, deleteAppointment } = require('../google-sheet-utils');

// ===============================
// Configuration Constants
// ===============================

/**
 * Path to the Google service account's JSON key file.
 */
const KEY_FILE_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../google.json');

/**
 * The OAuth scopes required for accessing Google Sheets.
 */
const SCOPES = (process.env.GOOGLE_SHEETS_SCOPES || 'https://www.googleapis.com/auth/spreadsheets').split(',');

/**
 * The ID of the Google Spreadsheet.
 */
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '1vLtvhdMnIk-iZEZWVgmFxfpzR7Hc3Gk4C0Iv9drB9tg';

// ===============================
// Google Sheets API Client
// ===============================

/**
 * Gets the Google Sheets API client.
 * @returns {Promise<google.sheets_v4.Sheets>} A Google Sheets client instance.
 */
async function getSheetsClient() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
        return google.sheets({ version: 'v4', auth });
    } catch (error) {
        console.error('Error getting Sheets client:', error);
        throw error;
    }
}

// ===============================
// Core Google Sheets Operations
// ===============================

/**
 * Reads data from a Google Sheet.
 * @param {string} sheetName - The name of the sheet to read from.
 * @returns {Promise<Array<object>>} An array of objects representing the data.
 * @throws {Error} If there is an error reading from the sheet.
 */
async function readGoogleSheet(sheetName) {
    console.log(`[readGoogleSheet] Called with sheetName: ${sheetName}`);
    try {
        const sheets = await getSheetsClient();

        // Use the sheetName to get all the data in the sheet.
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: sheetName,
        });

        const values = response.data.values;

        if (!values || values.length === 0) {
            console.log('No data found.');
            return [];
        }
        // Dynamically determine the range
        const lastColumnLetter = String.fromCharCode(64 + values[0].length);
        const lastRow = values.length;
        const actualRange = `${sheetName}!A1:${lastColumnLetter}${lastRow}`;


        const finalResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: actualRange,
        });

        const rows = finalResponse.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found.');
            return [];
        }

        const headers = rows[0].map(h => h.trim());
        const dataset = [];
        for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header row
            const row = rows[i];
            const dataRow = {};
            for (let colIndex = 0; colIndex < headers.length; colIndex++) {
                dataRow[headers[colIndex]] = row[colIndex] ? row[colIndex].trim() : ''; // Handle null/undefined
            }
            dataset.push(dataRow);
        }
        return dataset;
    } catch (error) {
        console.error('Error reading Google Sheet:', error);
        throw error;
    }
}

/**
 * Appends data to a Google Sheet.
 * @param {Array<string>} row - The row data to append.
 * @param {string} sheetName - The name of the sheet to append to.
 * @returns {Promise<void>}
 * @throws {Error}
 */
async function appendToSheet(sheetName, row) {
    console.log(`Appending to ${sheetName}:`, row);
    const sheets = await getSheetsClient();
    try {
        const result = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`, // Append to the first available row
            valueInputOption: 'RAW',
            resource: { values: [row] },
        });
        console.log('Append result:', result.data);
    } catch (error) {
        console.error(`Error appending to ${sheetName}:`, error);
        throw error;
    }
}

/**
 * Updates the monthly calendar with appointment information.
 * @param {object} params - Object containing: doctor, date, time, location, appointmentId, patientName.
 * @returns {Promise<void>}
 * @throws {Error}
 */
async function updateMonthlyCalendar(params) {
    console.log('Updating monthly calendar:', params);
    const { doctor, date, time, location, appointmentId, patientName } = params;
    const sheets = await getSheetsClient();
    const [day, month, year] = date.split(' ');
    const monthSheet = `${month} ${year.slice(-2)}`;

    try {
        // 1. Get the values of the sheet
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: monthSheet,
        });
        const values = response.data.values;

        // 2. Determine the column index for the day.
        let dayColIdx = -1;
        if (values && values[1]) { // Ensure there's a second row to search in
            dayColIdx = values[1].findIndex(d => d?.toString().trim() === day.trim());
        }

        // 3. Determine the row index for the time.
        let timeRowIdx = -1;
        if (values) {
             timeRowIdx = values.findIndex((row) => row[0]?.toString().trim() === time.trim());
        }
       
        console.log('Found timeRowIdx:', timeRowIdx, 'dayColIdx:', dayColIdx);

        // 4. Update the specific cell
        if (dayColIdx > -1 && timeRowIdx > -1) {
            const bookingText = `${location} - ${appointmentId} - ${patientName}`;
            const updateRange = `${monthSheet}!${String.fromCharCode(65 + dayColIdx)}${timeRowIdx + 1}`; // Convert column index to letter
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: { values: [[bookingText]] },
            });
            console.log('Calendar update successful');
        } else {
            console.log('Could not find correct cell for calendar update.');
            throw new Error('Could not find correct cell for calendar update.');
        }
    } catch (error) {
        console.error('Error updating monthly calendar:', error);
        throw error;
    }
}

// ===============================
// Appointment Management
// ===============================
/**
 * Retrieves all unique clinic locations from the 'Doctors' sheet.
 * @returns {Promise<string[]>} An array of unique clinic locations.
 * @throws {Error}
 */
async function getAllClinicLocations(visitReason) {
    try {
        console.log("Input visitReason:", visitReason); // Log the input visitReason
        const doctorsJobsData = await readGoogleSheet('Doctors_Jobs');
        const doctorsData = await readGoogleSheet('Doctors');

        if (!doctorsJobsData || doctorsJobsData.length === 0) {
            console.log("Doctors_Jobs sheet is empty.");
            return []; // Return empty array if no data
        }

        // 1. Extract job scopes from the header row of "Doctors_Jobs"
        const jobScopes = Object.keys(doctorsJobsData[0]).slice(1); // Skip "Doctor Name"
        console.log("Available jobScopes:", jobScopes);

        // 2. Match visitReason with job scope
        let matchingJobScope = '';
        for (const scope of jobScopes) {
            const scopeCode = scope.split('.')[0].trim().toLowerCase(); //get the "a" from "a. General..."
            if (scopeCode === visitReason.toLowerCase()) {
                matchingJobScope = scope;
                break;
            }
        }
        console.log("Matching jobScope:", matchingJobScope);


        if (!matchingJobScope) {
            console.log(`Visit reason "${visitReason}" not found in job scopes.`);
            return []; // Return empty array if no matching job scope
        }

        // 3. Find doctors who perform the service
        const matchingDoctors = doctorsJobsData
            .filter(row => row[matchingJobScope]?.trim().toLowerCase() === 'yes')
            .map(row => row['Doctor Name']?.trim());

        console.log("Matching doctors:", matchingDoctors);

        if (!matchingDoctors || matchingDoctors.length === 0) {
            console.log(`No doctors found for visit reason "${visitReason}".`);
            return []; // Return empty array if no matching doctors
        }

        // 4. Find locations for the matching doctors
        const locations = new Set();
        for (const doctorName of matchingDoctors) {
            const doctorSchedules = doctorsData.filter(row => row['Doctor Name'] === doctorName);
            doctorSchedules.forEach(schedule => {
                const location = schedule['Location']?.trim();
                if (location) {
                    locations.add(location);
                }
            });
        }

        console.log("Locations:", locations); // Log the final locations
        return {
            locations: Array.from(locations),
            doctors: Array.from(matchingDoctors),
        };
    } catch (error) {
        console.error('Error in getAllClinicLocations:', error);
        throw error;
    }
}


/**
 * Retrieves all unique doctor names, optionally filtered by location.
 * @param {string} location - The clinic location to filter by. Optional.
 * @returns {Promise<string[]>} An array of unique doctor names.
 * @throws {Error}
 */
async function getAllDoctors(location) {
    try {
        const data = await readGoogleSheet('Doctors');
        let doctors = data.map(row => row['Doctor Name']?.trim()).filter(Boolean);
        if (location) {
            doctors = data.filter(row => row['Location'] === location).map(row => row['Doctor Name']?.trim()).filter(Boolean);
        }
        return [...new Set(doctors)];
    } catch (error) {
        console.error('Error in getAllDoctors:', error);
        throw error;
    }
}

/**
 * Retrieves the availability for a specific doctor.
 * @param {string} doctorName - The name of the doctor.
 * @returns {Promise<Array<object>>} An array of availability information.
 * @throws {Error}
 */
async function getDoctorAvailability(doctorName) {
    try {
        const data = await readGoogleSheet('Doctors');
        return data.filter(row => row['Doctor Name'] === doctorName);
    } catch (error) {
        console.error('Error in getDoctorAvailability:', error);
        throw error;
    }
}

/**
 * Appends a new appointment and updates the calendar.
 * @param {object} appointmentData - Appointment data including: doctor, clinic_location, patient_name, contact_number, visit_reason, appointment_time, date.
 * @returns {Promise<object>} - Appointment object with status.
 * @throws {Error}
 */
async function appendAppointment(appointmentData) {
    try {
        const {
            doctor,
            clinic_location,
            patient_name,
            contact_number,
            visit_reason,
            appointment_time,
            date,
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
            clinic_location,
        ];

        await appendToSheet('Patients_Booking', bookingRow);

        await updateMonthlyCalendar({
            doctor,
            date,
            time: appointment_time,
            location: clinic_location,
            appointmentId,
            patientName: patient_name,
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
                date,
            },
        };
    } catch (error) {
        console.error('Error in appendAppointment:', error);
        throw error;
    }
}

/**
 * Updates an existing appointment.
 * @param {string} appointmentId - The ID of the appointment to update.
 * @param {object} updatedData - The data to update (time, date, etc.).
 * @returns {Promise<object>} The updated appointment object.
 * @throws {Error}
 */
async function updateAppointment(appointmentId, updatedData) {
    try {
        console.log('[updateAppointment] Called with:', { appointmentId, updatedData });
        const appointments = await readGoogleSheet('Patients_Booking');
        const appointmentIndex = appointments.findIndex(app => app['Appointment ID'] === appointmentId);
        if (appointmentIndex === -1) {
            throw new Error('Appointment not found');
        }

        const appointment = appointments[appointmentIndex];

        // Check for slot availability if time or date is being updated
        const timeChanged = updatedData.appointment_time && updatedData.appointment_time !== appointment['Time'];
        const dateChanged = updatedData.date && updatedData.date !== appointment['Date'];

        if (timeChanged || dateChanged) {
            // Use the getAppointmentById function.
            const existingAppointment = await getAppointmentById(appointmentId);
            if (!existingAppointment) {
                throw new Error('Appointment to be updated not found');
            }
            const isSlotTaken = await checkAppointmentExists(
                existingAppointment['Preferred Doctor'], // Use the correct field name
                existingAppointment['Location'],        // Use the correct field name
                updatedData.appointment_time || existingAppointment['Time'],
                updatedData.date || existingAppointment['Date'],
                appointmentId
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
            // Add other fields to update as needed
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

        // Update the row in the sheet
        await updateRowInSheet('Patients_Booking', updatedRow, appointmentIndex);

        await updateMonthlyCalendar({
            doctor: updatedAppointment['Preferred Doctor'], // Use correct field name.
            date: updatedAppointment['Date'],
            time: updatedAppointment['Time'],
            location: updatedAppointment['Location'],
            appointmentId: updatedAppointment['Appointment ID'],
            patientName: updatedAppointment['Patient Name']
        });

        console.log('[updateAppointment] Row updated successfully.');
        return updatedAppointment;
    } catch (err) {
        console.error('[updateAppointment] Error:', err);
        throw err;
    }
}

// ===============================
// Module Exports
// ===============================

module.exports = {
    getAllClinicLocations,
    getAllDoctors,
    getDoctorAvailability,
    appendAppointment,
    appendToSheet,
    updateMonthlyCalendar,
    readGoogleSheet,
    updateAppointment,
    getAppointmentById,
    deleteAppointment
};
