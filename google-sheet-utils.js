const { google } = require('googleapis');
const path = require('path');

// Path to your JSON key file
const KEY_FILE_PATH = path.join(__dirname, 'google.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const spreadsheetId = '18cfDpjNVlae9Ykn8w9AJvVjw3rlWFknd9Z1wrWfZqOg';

async function readGoogleSheet(sheetId) {
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
            range: `${sheetId}!A1:Z100`,
        });

        const rows = response.data.values;

        if (!rows || rows.length === 0) {
            console.log('No data found.');
            return;
        }

        let headers = null
        let dataset = []
        for (let row of rows) {
            if (!headers) {
                headers = row
            } else {
                const dataRow = {}
                for (let colIndex in row) {
                    dataRow[`${headers[colIndex].trim()}`] = row[colIndex].trim()
                }
                dataset.push(dataRow)
            }
        }

        return dataset;
    } catch (error) {
        console.error('Error reading Google Sheet:', error.message);
        throw error
    }
}

async function getAllClinicLocations() {
    return await readGoogleSheet('Clinic-Locations')
}

async function getAllDoctorsAvailabilities() {
    return await readGoogleSheet('Doctors-Availability')
}

async function getAppointments() {
    return await readGoogleSheet('Appointments')
}

async function appendData(value) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // Data to be appended
        const values = [
            value,
            // Add more rows as needed
        ];

        const resource = {
            values,
        };

        const result = await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: 'Appointments!A1', // Adjust the sheet name and range as needed
            valueInputOption: 'RAW',
            resource,
        });

        console.log(`${result.data.updates.updatedCells} cells appended.`);
    } catch (error) {
        console.error('Error appending data:', error);
    }
}

async function updateGoogleSheet(value, rowId) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // Data to be appended
        const values = [
            value,
            // Add more rows as needed
        ];

        // 0 Header, count from that
        const rowNumber = rowId + 2;
        const sheetName = 'Appointments'; // Update if your sheet name is different

        // Calculate range based on data length (assumes columns start from A)
        const startColumn = 'A';
        const endColumn = String.fromCharCode(65 + value.length - 1); // Convert to column letters
        const range = `${sheetName}!${startColumn}${rowNumber}:${endColumn}${rowNumber}`;

        const resource = {
            values,
        };

        await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: range, // Adjust the sheet name and range as needed
            valueInputOption: 'RAW',
            resource,
        });

        console.log(`cells updated.`);
    } catch (error) {
        console.error('Error appending data:', error);
    }
}

async function deleteGoogleSheetRow(rowId) {
    try {
        // 1) Authorize
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // 2) Get the Sheet ID by name ("Appointments" in this example).
        //    The "sheetId" is different from the "spreadsheetId".
        const sheetName = 'Appointments';
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

        // 3) Calculate zero-based row indexes for the deletion request
        //    If your rowId refers to "data row #", and you skip headers
        //    in your UI logic, offset appropriately.
        //    For example, if rowId = 0 is your first data row
        //    (i.e., visually row 2 in the sheet since row 1 is a header),
        //    then startIndex = rowId + 1.
        const startIndex = rowId + 1; // Adjust offset as needed
        const endIndex = startIndex + 1;

        // 4) Issue the "deleteDimension" request
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
    } catch (error) {
        console.error('Error deleting row:', error);
    }
}

module.exports = {
    getAllClinicLocations,
    getAllDoctorsAvailabilities,
    getAppointments,
    appendData,
    updateGoogleSheet,
    deleteGoogleSheetRow
}
