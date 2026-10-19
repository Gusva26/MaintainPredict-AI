const express = require('express');
const app = express();
const PORT = process.env.PORT || 9001;
const ERP_API_KEY = process.env.ERP_API_KEY || 'erp_key';

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-erp', timestamp: new Date().toISOString() });
});

// Middleware auth
app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key && key !== ERP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: invalid ERP API key' });
  }
  next();
});

const PARTS_CATALOG = {
  bearing: [
    { sku: 'BRG-6205', name: 'Rodamiento rígido de bolas 6205', qty: 12, lead_days: 1, cost_eur: 45.00 },
    { sku: 'LUB-EP2', name: 'Grasa sintética industrial EP2', qty: 25, lead_days: 0, cost_eur: 18.50 }
  ],
  motor: [
    { sku: 'MTR-5KW', name: 'Bobinado motor trifásico 5kW', qty: 2, lead_days: 3, cost_eur: 420.00 },
    { sku: 'BRG-6206', name: 'Rodamiento SKF Explorer 6206', qty: 8, lead_days: 1, cost_eur: 58.00 }
  ],
  pump: [
    { sku: 'SEAL-PMP', name: 'Cierre mecánico para bomba centrífuga', qty: 6, lead_days: 2, cost_eur: 85.00 },
    { sku: 'IMP-PMP', name: 'Impulsor de acero inoxidable', qty: 3, lead_days: 5, cost_eur: 210.00 }
  ],
  belt: [
    { sku: 'BLT-A45', name: 'Correa trapezoidal A45', qty: 15, lead_days: 1, cost_eur: 22.00 }
  ],
  valve: [
    { sku: 'VLV-DN50', name: 'Válvula de mariposa DN50', qty: 4, lead_days: 2, cost_eur: 135.00 }
  ],
  unknown: [
    { sku: 'KIT-GEN', name: 'Kit estándar de inspección preventiva', qty: 20, lead_days: 1, cost_eur: 50.00 }
  ]
};

// Check parts endpoint
app.post('/erp/check-parts', (req, res) => {
  const component = (req.body && req.body.component ? String(req.body.component).toLowerCase() : 'unknown');
  const parts = PARTS_CATALOG[component] || PARTS_CATALOG.unknown;
  res.json({ component, parts, in_stock: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Mock ERP] Listening on port ${PORT}`);
});
