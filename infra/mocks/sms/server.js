// Pasarela de SMS simulada (solo desarrollo).
//
// Emula el contrato mínimo de un proveedor de SMS (p. ej. Twilio) para poder
// probar las notificaciones sin gastar crédito ni enviar mensajes reales.
//
//   GET  /health        → estado del servicio
//   POST /sms/send      → { to, message, from? } → { id, status: 'queued' }
//   GET  /sms/messages  → bandeja de entrada simulada (para inspección)

const express = require('express');

const app = express();
const PORT = process.env.PORT || 9002;
const API_KEY = process.env.SMS_API_KEY || '';

app.use(express.json());

const sent = [];
let seq = 0;

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mock-sms',
    sent: sent.length,
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (API_KEY && key && key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: invalid SMS API key' });
  }
  next();
});

app.post('/sms/send', (req, res) => {
  const { to, message, from } = req.body || {};
  if (!to || !message) {
    return res.status(422).json({ error: 'Se requieren "to" y "message"' });
  }

  const record = {
    id: `SM${String(++seq).padStart(6, '0')}`,
    to: String(to),
    from: String(from || process.env.SMS_FROM || '+15550000000'),
    message: String(message),
    status: 'queued',
    createdAt: new Date().toISOString(),
  };
  sent.push(record);

  console.log(`[Mock SMS] -> ${record.to}: ${record.message}`);
  res.status(201).json(record);
});

app.get('/sms/messages', (_req, res) => {
  res.json({ count: sent.length, messages: sent });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Mock SMS] Listening on port ${PORT}`);
});
