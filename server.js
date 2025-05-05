const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
const appointmentRoutes = require('./routes/appointmentRoutes');
app.use('/api', appointmentRoutes);

// Default route
app.get('/', (req, res) => {
    res.send('Welcome to the Lemint Workflow API!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 