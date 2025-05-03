const express = require('express');
const { getAllClinicLocations, getAllDoctorsAvailabilities, appendData, updateGoogleSheet, getAppointments, deleteGoogleSheetRow } = require('./google-sheet-utils');
const { createUniqueId } = require('./object-util');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse query parameters
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const cleanData = (data) => {
    try {
        return data.trim().replaceAll('"', "")
    } catch (e) {
        return data
    }
}

const validateAppointment = async (doctor, clinic_location, appointment_time) => {
    try {
        const appointments = await getAppointments()
        const foundExists = appointments.find(app =>
            app['Doctor'].trim() === doctor &&
            app['Clinic Location'].trim() === clinic_location &&
            app['Appointment Time'].trim() === appointment_time
        )
        return !foundExists
    } catch (e) {
        return true
    }
}

// Convert all the tasks to API endpoints
app.get('/api/appointment', async (req, res) => {
    try {
        const { task, clinic_location, doctor, patient_name, contact_number, visit_reason, appointment_time, appointment_id } = req.query;
        const clinicLocations = await getAllClinicLocations();
        const doctorsAvailabilities = await getAllDoctorsAvailabilities();
        let message = {};

        if (task === 'get_clinics') {
            let cities = [...new Set(clinicLocations.map(entry => `- ${entry["Clinic Location"]}`))];
            cities = cities.join('\n')
            message = {
                cities: `Please select your preferred clinic location. \n\n${cities}`
            }
        } else if (task === 'get_doctors_by_location') {
            const cleanLocation = clinic_location.trim();
            let doctors = clinicLocations
                .filter(entry => entry["Clinic Location"].trim() === cleanLocation)
                .map(entry => `- ${entry["Doctor Name"]}`);

            if (doctors.length === 0) {
                message = {
                    doctor_found: 'not_found'
                }
            } else {
                doctors = doctors.join('\n')
                message = {
                    doctor_found: 'found',
                    doctors: `Please select doctor. \n\n${doctors}`
                }
            }
        } else if (task === 'get_doctors_availabilities') {
            const cleanDoctor = doctor.trim();
            const docAvailabilities = doctorsAvailabilities.filter(entry => entry["Doctor Name"].trim() === cleanDoctor);

            const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

            // Function to get day difference from today
            const getDayDifference = (day) => {
                const today = new Date();
                const currentDayIndex = today.getDay();
                const targetDayIndex = daysOfWeek.indexOf(day);
                return (targetDayIndex - currentDayIndex + 7) % 7;
            };

            // Sort data by nearest day and start time
            const sortedAvailabilities = docAvailabilities.sort((a, b) => {
                const dayDiffA = getDayDifference(a.Day);
                const dayDiffB = getDayDifference(b.Day);

                if (dayDiffA !== dayDiffB) {
                    return dayDiffA - dayDiffB;
                }

                // Parse start time to compare
                const parseTime = (time) => {
                    const [hours, minutes] = time.match(/(\d+):(\d+)/).slice(1).map(Number);
                    const isPM = time.includes("PM");
                    return (isPM && hours < 12 ? hours + 12 : hours) * 60 + minutes;
                };

                return parseTime(a["Start Time"]) - parseTime(b["Start Time"]);
            });

            let availabilities = sortedAvailabilities.map(entry => `- ${entry["Day"]}, ${entry["Start Time"]}`)
            availabilities = availabilities.join('\n')
            message = {
                availabilities: `Please select time slot for the appointment\n\n${availabilities}`
            }
        } else if (task === 'appointment_save') {
            const clean_doctor = cleanData(doctor);
            const clean_clinic_location = cleanData(clinic_location);
            const clean_patient_name = cleanData(patient_name);
            const clean_contact_number = cleanData(contact_number);
            const clean_visit_reason = cleanData(visit_reason);
            const clean_appointment_time = cleanData(appointment_time);

            const appointment_id = createUniqueId(10);

            const valid = await validateAppointment(clean_doctor, clean_clinic_location, clean_appointment_time);
            if (!valid) {
                message = {
                    error: 'already_exists'
                }
            } else {
                await appendData([appointment_id, clean_doctor, clean_clinic_location, clean_patient_name, clean_contact_number, clean_visit_reason, clean_appointment_time]);
                message = {
                    appointment_id
                }
            }
        } else if (task === 'appointment_reschedule') {
            const clean_appointment_id = cleanData(appointment_id);
            const clean_appointment_time = cleanData(appointment_time);

            let appointments = await getAppointments();
            let currentAppointmentIndex = appointments.findIndex(app => app['Appointment ID'] === clean_appointment_id);
            let currentAppointment = appointments[currentAppointmentIndex];
            
            if (!currentAppointment) {
                message = {
                    error: 'not found'
                }
            } else {
                const c_doctor = currentAppointment['Doctor'];
                const c_clinic_location = currentAppointment['Clinic Location'];
                const c_patient_name = currentAppointment['Patient Name'];
                const c_contact_number = currentAppointment['Contact Number'];
                const c_visit_reason = currentAppointment['Reason to Visit'];

                const foundExists = appointments.find(app =>
                    app['Appointment ID'].trim() !== clean_appointment_id &&
                    app['Doctor'].trim() === c_doctor &&
                    app['Clinic Location'].trim() === c_clinic_location &&
                    app['Appointment Time'].trim() === clean_appointment_time
                );
                
                const valid = !foundExists;
                if (!valid) {
                    message = {
                        error: 'already_exists'
                    }
                } else {
                    await updateGoogleSheet(
                        [clean_appointment_id, c_doctor, c_clinic_location, c_patient_name, c_contact_number, c_visit_reason, clean_appointment_time],
                        currentAppointmentIndex
                    );
                    message = {};
                }
            }
        } else if (task === 'appointment_cancel') {
            const clean_appointment_id = cleanData(appointment_id);

            let appointments = await getAppointments();
            let currentAppointmentIndex = appointments.findIndex(app => app['Appointment ID'] === clean_appointment_id);
            let currentAppointment = appointments[currentAppointmentIndex];
            
            if (!currentAppointment) {
                message = {
                    error: 'not found'
                }
            } else {
                await deleteGoogleSheetRow(currentAppointmentIndex);
                message = {};
            }
        } else if (task === 'appointment_fetch') {
            const normalize = (val) => (val || "")
                .toString()
                .trim()
                .replace(/[\u200b\r\n\s"]/g, ""); // remove zero-width, newline, whitespace, and quotes
        
            const clean_appointment_id = normalize(appointment_id);
            console.log("🔍 Received confirmation ID from user:", JSON.stringify(clean_appointment_id));
        
            let appointments = await getAppointments();
        
            let currentAppointmentIndex = appointments.findIndex(app =>
                normalize(app['Appointment ID']) === clean_appointment_id
            );
        
            const currentAppointment = appointments[currentAppointmentIndex];
        
            if (!currentAppointment) {
                console.log("⚠️ No matching appointment found for ID:", JSON.stringify(clean_appointment_id));
                message = {
                    error: 'not found'
                };
            } else {
                console.log("✅ Found appointment:", currentAppointment);
                message = {
                    appointment_id: clean_appointment_id,
                    doctor: currentAppointment['Doctor'],
                    clinic_location: currentAppointment['Clinic Location'],
                    patient_name: currentAppointment['Patient Name'],
                    contact_number: currentAppointment['Contact Number'],
                    visit_reason: currentAppointment['Reason to Visit'],
                    appointment_time: currentAppointment['Appointment Time']
                };
            }
        }
        
        

        return res.json({ message });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 