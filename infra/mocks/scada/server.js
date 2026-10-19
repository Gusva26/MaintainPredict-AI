const express = require('express');
const app = express();
const PORT = process.env.PORT || 9000;
const SCADA_API_KEY = process.env.SCADA_API_KEY || 'scada_key';

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-scada', timestamp: new Date().toISOString() });
});

// Middleware auth
app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key && key !== SCADA_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: invalid SCADA API key' });
  }
  next();
});

// Latest equipment readings
app.get('/scada/equipment/:id/latest', (req, res) => {
  const equipmentId = parseInt(req.params.id, 10);
  const now = new Date().toISOString();
  
  // Return realistic telemetry
  const telemetry = [
    { sensorId: equipmentId * 4 + 1, type: 'vibration', value: +(Math.random() * 8 + 2).toFixed(2), unit: 'mm/s', recordedAt: now },
    { sensorId: equipmentId * 4 + 2, type: 'temperature', value: +(Math.random() * 40 + 45).toFixed(1), unit: '°C', recordedAt: now },
    { sensorId: equipmentId * 4 + 3, type: 'pressure', value: +(Math.random() * 3 + 4).toFixed(2), unit: 'bar', recordedAt: now },
    { sensorId: equipmentId * 4 + 4, type: 'current', value: +(Math.random() * 20 + 15).toFixed(2), unit: 'A', recordedAt: now }
  ];
  
  res.json(telemetry);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Mock SCADA] Listening on port ${PORT}`);
});
