// services/googleSheetService.js
const { google } = require('googleapis');
const path = require('path');
const { createUniqueId } = require('./object-util');
//

// Path to your JSON key file
const KEY_FILE_PATH = path.join(__dirname, './google.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Your Google Spreadsheet ID
const spreadsheetId = '1vLtvhdMnIk-iZEZWVgmFxfpzR7Hc3Gk4C0Iv9drB9tg';

async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: SCOPES,
    });
    return google.sheets({ version: 'v4', auth });
}

async function readGoogleSheet(sheetName) {
    console.log('[readGoogleSheet] Called with:', sheetName);
    try {
        // Authenticate using the service account
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });

        // Create Google Sheets API client
        const sheets = google.sheets({ version: 'v4', auth });

        // Read data from the Google Sheet
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1:Z100`,
        });

        const rows = response.data.values;

        if (!rows || rows.length === 0) {
            console.log('No data found.');
            return [];
        }

        const headers = rows[0].map(h => h.trim());
        let dataset = [];
        for (let row of rows) {
            if (!headers) {
                headers = row;
            } else {
                const dataRow = {};
                for (let colIndex in row) {
                    dataRow[`${headers[colIndex].trim()}`] = row[colIndex].trim();
                }
                dataset.push(dataRow);
            }
        }

        console.log('[readGoogleSheet] Headers:', headers);
        console.log('[readGoogleSheet] First row:', rows[1]);

        return dataset;
    } catch (error) {
        console.error('Error reading Google Sheet:', error);
        throw error;
    }
}

async function appendDataToSheet(sheetName, value) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // Data to be appended
        const values = [value];

        const resource = {
            values,
        };

        const result = await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            resource,
        });

        console.log(`${result.data.updates.updatedCells} cells appended.`);
        return true;
    } catch (error) {
        console.error('Error appending data:', error);
        throw error;
    }
}

async function deleteRowFromSheet(sheetName, rowId, deletedAppointment) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // Get the Sheet ID by name
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId,
        });
        const sheet = spreadsheet.data.sheets.find(
            (s) => s.properties.title === sheetName
        );

        if (!sheet) {
            throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
        }

        const sheetId = sheet.properties.sheetId;

        // Fetch all rows for logging
        const resp = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A1:Z100`
        });
        const rows = resp.data.values;
        console.log('[deleteRowFromSheet] All rows:', JSON.stringify(rows));
        // Log the row data for the actual index to be deleted
        let startIndex = rowId;
        let endIndex = startIndex + 1;
        console.log('[deleteRowFromSheet] Using startIndex:', startIndex, 'endIndex:', endIndex, 'Row data:', rows[startIndex]);
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId: sheetId,
                                dimension: 'ROWS',
                                startIndex: startIndex,
                                endIndex: endIndex,
                            },
                        },
                    },
                ],
            },
        });

        console.log(`Row ${rowId} deleted successfully.`);

        // --- Clear the corresponding cell in the calendar sheet ---
        if (deletedAppointment && deletedAppointment['Date'] && deletedAppointment['Time']) {
            const [day, month, year] = deletedAppointment['Date'].split(' ');
            const monthSheet = `${month} ${year.slice(-2)}`; // e.g., 'May 25'
            const calendarResp = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${monthSheet}!A1:Z100`
            });
            const values = calendarResp.data.values;
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
                if (values[i][0] && values[i][0].toString().trim() === deletedAppointment['Time'].trim()) {
                    timeRowIdx = i;
                    break;
                }
            }
            if (timeRowIdx !== -1 && dayColIdx !== -1) {
                values[timeRowIdx][dayColIdx] = '';
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${monthSheet}!A1:Z100`,
                    valueInputOption: 'RAW',
                    resource: { values }
                });
                console.log(`[deleteRowFromSheet] Cleared calendar cell for ${deletedAppointment['Date']} ${deletedAppointment['Time']}`);
            } else {
                console.log('[deleteRowFromSheet] Could not find calendar cell to clear.');
            }
        }
        // --- End calendar update ---

        return true;
    } catch (error) {
        console.error('Error deleting row:', error);
        throw error;
    }
}

async function updateRowInSheet(sheetName, row, rowIndex) {
    const sheets = await getSheetsClient();
    // Adjust the range to match your columns (A-H for 8 columns)
    const range = `${sheetName}!A${rowIndex + 2}:H${rowIndex + 2}`; // +2 because row 0 is headers, row 1 is first data row
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: { values: [row] }
    });
}

// Service functions
module.exports = {
    getAllClinicLocations: async () => {
        const data = await readGoogleSheet('Clinic-Locations');
        const locations = [...new Set(data.map(row => row['Clinic Location']).filter(Boolean))];
        return locations;
    },
    
    getAllDoctors: async (location) => {
        const data = await readGoogleSheet('Doctors-Availability');
        let doctors;
        
        if (location) {
            doctors = data
                .filter(row => row['Location'] === location)
                .map(row => row['Doctor Name']);
        } else {
            doctors = data.map(row => row['Doctor Name']);
        }
        
        return [...new Set(doctors.filter(Boolean))];
    },
    
    getDoctorAvailability: async (doctorName) => {
        const data = await readGoogleSheet('Doctors-Availability');
        return data.filter(row => row['Doctor Name'] === doctorName);
    },
    
    getAppointments: async () => {
        return await readGoogleSheet('Patients_Booking');
    },
    
    getAppointmentById: async (appointmentId) => {
        const appointments = await readGoogleSheet('Patients_Booking');
        console.log('[getAppointmentById] Looking for:', appointmentId, 'in', appointments.map(a => a['Appointment ID']));
        for (const app of appointments) {
            console.log(
                'Comparing:',
                JSON.stringify((app['Appointment ID'] || '')),
                '(', typeof app['Appointment ID'], ')',
                'vs',
                JSON.stringify(appointmentId),
                '(', typeof appointmentId, ')'
            );
            if ((app['Appointment ID'] || '').toString().trim() === appointmentId.toString().trim()) {
                console.log('[Controller] Appointment found:', app);
                return app;
            }
        }
        console.log('[getAppointmentById] No match found. All appointments:', appointments);
        return undefined;
    },
    
    appendAppointment: async (appointmentData) => {
        const { doctor, clinic_location, patient_name, contact_number, visit_reason, appointment_time } = appointmentData;
        
        // Generate a unique appointment ID
        const appointmentId = createUniqueId(10);
        
        // Check if the appointment slot is already taken
        const appointments = await readGoogleSheet('Patients_Booking');
        const isSlotTaken = appointments.some(app => 
            app['Doctor'] === doctor && 
            app['Clinic Location'] === clinic_location && 
            app['Appointment Time'] === appointment_time
        );
        
        if (isSlotTaken) {
            throw new Error('Appointment slot already taken');
        }
        
        // Prepare appointment data as an array for Google Sheets
        const appointmentRow = [
            appointmentId,
            doctor,
            clinic_location,
            patient_name,
            contact_number,
            visit_reason,
            appointment_time
        ];
        
        // Append to Patients_Booking sheet
        await appendDataToSheet('Patients_Booking', appointmentRow);
        
        // Return formatted appointment object
        return {
            appointmentId,
            doctor,
            clinic_location,
            patient_name,
            contact_number,
            visit_reason,
            appointment_time
        };
    },
    
    updateAppointment: async (appointmentId, updatedData) => {
        try {
            console.log('[updateAppointment] Called with:', { appointmentId, updatedData });
            // Get all appointments
            const appointments = await readGoogleSheet('Patients_Booking');
            console.log('[updateAppointment] Loaded appointments:', appointments.length);
            // Find the appointment by ID
            const appointmentIndex = appointments.findIndex(app => app['Appointment ID'] === appointmentId);
            console.log('[updateAppointment] Found appointment index:', appointmentIndex);
            if (appointmentIndex === -1) {
                console.error('[updateAppointment] Appointment not found for ID:', appointmentId);
                throw new Error('Appointment not found');
            }
            const appointment = appointments[appointmentIndex];
            // 1. Parse the requested date
            const [day, month, year] = (updatedData.date || appointment['Date']).split(' ');
            const monthSheet = `${month} ${year.slice(-2)}`; // e.g., 'May 25'
            const sheets = await getSheetsClient();
            const resp = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${monthSheet}!A1:Z100`
            });
            const values = resp.data.values;

            // 2. Find the column for the day in the second row (values[1])
            let dayColIdx = -1;
            if (values[1]) {
                for (let j = 0; j < values[1].length; j++) {
                    if (values[1][j] && values[1][j].toString().trim() === day.trim()) {
                        dayColIdx = j;
                        break;
                    }
                }
            }

            // 3. Find the row for the time in the first column, starting from row 3 (values[2][0], ...)
            let timeRowIdx = -1;
            const requestedTime = updatedData.appointment_time || appointment['Appointment Time'];
            for (let i = 2; i < values.length; i++) {
                if (values[i][0] && values[i][0].toString().trim() === requestedTime.trim()) {
                    timeRowIdx = i;
                    break;
                }
            }

            // 4. Check the cell value
            let cellValue = '';
            if (timeRowIdx !== -1 && dayColIdx !== -1) {
                cellValue = values[timeRowIdx][dayColIdx] || '';
            }
            console.log('[updateAppointment] Checking calendar sheet:', monthSheet);
            console.log('[updateAppointment] values[1] (days row):', values[1]);
            console.log('[updateAppointment] Requested day:', day, 'Requested time:', requestedTime);
            console.log('[updateAppointment] Calculated dayColIdx:', dayColIdx, 'timeRowIdx:', timeRowIdx);
            console.log('[updateAppointment] Raw cell value:', JSON.stringify(cellValue));
            if (!cellValue || cellValue.trim() === '') {
                throw new Error('Doctor is not available at the requested date and time');
            }
            console.log('[updateAppointment] Checking calendar sheet:', monthSheet);
            console.log('[updateAppointment] values[1] (days row):', values[1]);
            console.log('[updateAppointment] Requested day:', day, 'Requested time:', requestedTime);
            console.log('[updateAppointment] Calculated dayColIdx:', dayColIdx, 'timeRowIdx:', timeRowIdx);
            console.log('[updateAppointment] Cell value:', cellValue, '| isAvailable:', cellValue);
            // Create updated appointment object
            const updatedAppointment = {
                ...appointment,
                'Appointment Time': updatedData.appointment_time || appointment['Appointment Time'],
                'Doctor': updatedData.doctor || appointment['Doctor'],
                'Clinic Location': updatedData.clinic_location || appointment['Clinic Location'],
                'Patient Name': updatedData.patient_name || appointment['Patient Name'],
                'Contact Number': updatedData.contact_number || appointment['Contact Number'],
                'Reason to Visit': updatedData.visit_reason || appointment['Reason to Visit']
            };
            console.log('[updateAppointment] Updated appointment object:', updatedAppointment);
            // Convert to array format for Google Sheets
            const updatedRow = [
                updatedAppointment['Appointment ID'],
                updatedAppointment['Doctor'],
                updatedAppointment['Clinic Location'],
                updatedAppointment['Patient Name'],
                updatedAppointment['Contact Number'],
                updatedAppointment['Reason to Visit'],
                updatedAppointment['Appointment Time']
            ];
            console.log('[updateAppointment] Updating row in sheet:', updatedRow, 'at index', appointmentIndex);
            // Update the row in the sheet
            await updateRowInSheet('Patients_Booking', updatedRow, appointmentIndex);
            console.log('[updateAppointment] Row updated successfully.');
            return updatedAppointment;
        } catch (err) {
            console.error('[updateAppointment] Error:', err);
            throw err;
        }
    },
    
    deleteAppointment: async (appointmentId) => {
        try {
            console.log('[deleteAppointment] Called with:', appointmentId);
            const appointments = await readGoogleSheet('Patients_Booking');
            console.log('[deleteAppointment] Loaded appointments:', appointments.length);
            const appointmentIndex = appointments.findIndex(app => app['Appointment ID'] === appointmentId);
            console.log('[deleteAppointment] Looking for:', appointmentId, 'Found index:', appointmentIndex);
            if (appointmentIndex === -1) {
                console.error('[deleteAppointment] Appointment not found for ID:', appointmentId);
                throw new Error('Appointment not found');
            }
            const deletedAppointment = appointments[appointmentIndex];
            await deleteRowFromSheet('Patients_Booking', appointmentIndex, deletedAppointment);
            console.log('[deleteAppointment] Row deleted successfully.');
            return { success: true };
        } catch (err) {
            console.error('[deleteAppointment] Error:', err);
            throw err;
        }
    },
    
    checkAppointmentExists: async (doctor, clinic_location, appointment_time, excludeAppointmentId = null) => {
        const appointments = await readGoogleSheet('Patients_Booking');
        
        return appointments.some(app => 
            (excludeAppointmentId === null || app['Appointment ID'] !== excludeAppointmentId) &&
            app['Doctor'] === doctor &&
            app['Clinic Location'] === clinic_location &&
            app['Appointment Time'] === appointment_time
        );
    },
    updateRowInSheet
};