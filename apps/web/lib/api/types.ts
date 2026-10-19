import type { HealthStatus, IntegrationMode } from '@/lib/integrations/types';

export type Role = 'technician' | 'supervisor' | 'planner' | 'admin';

export type Equipment = {
  equipmentId: number;
  name: string;
  type: string;
  location: string | null;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  status: 'operational' | 'maintenance' | 'down' | 'retired';
  downtimeCostEurH: string;
  installationDate: string | null;
};

export type Sensor = {
  sensorId: number;
  equipmentId: number;
  type: string;
  unit: string | null;
  status: string;
  minThreshold: string | null;
  maxThreshold: string | null;
  equipment?: { equipmentId: number; name: string; criticality: string } | null;
};

export type User = {
  userId: number;
  email: string;
  fullName: string;
  role: Role;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type Reading = {
  readingId: number;
  sensorId: number;
  value: string;
  quality: 'good' | 'suspect' | 'bad';
  recordedAt: string;
};

export type Prediction = {
  predictionId: number;
  equipmentId: number;
  component: string | null;
  failureProbability: number;
  windowDays: number | null;
  modelVersion: string | null;
  explanation: string | null;
  createdAt: string;
  equipment?: Pick<Equipment, 'equipmentId' | 'name' | 'criticality' | 'location'> | null;
  alert?: boolean;
};

export type Order = {
  orderId: number;
  equipmentId: number;
  predictionId: number | null;
  scheduledDate: string | null;
  technicianId: number | null;
  parts: { sku: string; qty: number }[];
  estimatedDowntimeH: string | null;
  status: 'planned' | 'pending_approval' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  notes: string | null;
  requiresHitl: boolean;
  createdAt: string;
  equipment?: { equipmentId: number; name: string; criticality: string; location: string | null } | null;
  technician?: { userId: number; fullName: string; email: string } | null;
};

export type Paginated<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

/**
 * Contenido de `predictions.features` (jsonb): las señales que entraron al modelo,
 * el peso de cada una y la documentación RAG que se citó al explicarla.
 */
export type PredictionFeatures = {
  inputs?: { type: string; value: number; min: number; max: number; unit?: string }[];
  top_features?: { feature: string; value: number }[];
  rag_sources?: { doc_id: number; title: string; similarity: number }[];
};

/** Respuesta de `GET /api/predictions/:id`. */
export type PredictionDetailPayload = {
  prediction: Prediction & { features: PredictionFeatures | null };
  equipment: Equipment | null;
  /** Órdenes derivadas de esta predicción (puede estar vacío si aún no se planificó). */
  orders: Order[];
  hasOrder: boolean;
};

/** Respuesta de `GET /api/orders/:id`: la orden con todo su contexto. */
export type OrderDetailPayload = {
  order: Order;
  equipment: Equipment | null;
  technician: { userId: number; fullName: string; email: string; phone: string | null } | null;
  prediction: {
    predictionId: number;
    component: string | null;
    failureProbability: number;
    explanation: string | null;
    modelVersion: string | null;
  } | null;
  approvedBy: { userId: number; fullName: string } | null;
};

/** Respuesta de `GET /api/dashboard/kpis`: KPIs, contadores y objetivos en una sola llamada. */
export type DashboardKpis = {
  businessKpis: Record<string, number>;
  modelMetrics: Record<string, number>;
  counts: {
    equipment: number;
    equipmentDown: number;
    alertsLast7d: number;
    ordersOpen: number;
    ordersPendingApproval: number;
  };
  byStatus: { equipment: Record<string, number>; orders: Record<string, number> };
  targets: { precision: number; downtime_reduction: number; cost_reduction: number; availability: number };
};

/** Fila de la bitácora de auditoría: la entrada y el usuario que la provocó. */
export type AuditLogEntry = {
  log: {
    auditId: number;
    userId: number | null;
    action: string;
    module: string;
    entityType: string | null;
    entityId: string | null;
    payload: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string | null;
  };
  user: { userId: number; email: string; fullName: string; role: Role } | null;
};

/** Respuesta de `GET /api/integrations/health`. Se apoya en los tipos de dominio. */
export type IntegrationsHealth = {
  mode: IntegrationMode;
  summary: { total: number; ok: number; failed: string[]; slowestMs: number };
  adapters: HealthStatus[];
};

export type WeeklyReport = {
  window: { start: string; end: string };
  generatedAt: string;
  /** Filtros aplicados (H.1): `null` = sin filtrar. */
  filters: { equipmentId: number | null; technicianId: number | null };
  /** Qué se ha contado en la ventana y cuántas filas entran en el detalle (H.3). */
  counts: {
    ordersTotal: number;
    ordersIncluded: number;
    predictionsTotal: number;
    predictionsIncluded: number;
  };
  ordersByStatus: { status: string; n: number }[];
  topPredictions: { equipmentId: number; name: string | null; criticality: string | null; avgProb: number; maxProb: number; n: number }[];
  modelMetrics: { metric: string; value: number }[];
  businessKpis: { name: string; value: number }[];
  kpiTargets: { downtimeReduction: number; costReduction: number; modelPrecision: number };
};
