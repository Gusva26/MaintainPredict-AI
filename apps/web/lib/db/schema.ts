import {
  pgTable, serial, bigserial, varchar, text, integer, numeric,
  boolean, timestamp, date, jsonb, inet, index, customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// pgvector custom type for Drizzle
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector(1536)',
  toDriver: (v) => `[${v.join(',')}]`,
  fromDriver: (v) => JSON.parse(v as string),
});

export const users = pgTable('users', {
  userId: serial('user_id').primaryKey(),
  email: varchar('email', { length: 180 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  isActive: boolean('is_active').default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const equipment = pgTable('equipment', {
  equipmentId: serial('equipment_id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  location: varchar('location', { length: 200 }),
  criticality: varchar('criticality', { length: 20 }).notNull().default('medium'),
  installationDate: date('installation_date'),
  status: varchar('status', { length: 20 }).default('operational'),
  downtimeCostEurH: numeric('downtime_cost_eur_h', { precision: 10, scale: 2 }).default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const sensors = pgTable('sensors', {
  sensorId: serial('sensor_id').primaryKey(),
  equipmentId: integer('equipment_id').notNull().references(() => equipment.equipmentId, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  unit: varchar('unit', { length: 20 }),
  status: varchar('status', { length: 20 }).default('active'),
  minThreshold: numeric('min_threshold', { precision: 12, scale: 4 }),
  maxThreshold: numeric('max_threshold', { precision: 12, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const readings = pgTable('readings', {
  readingId: bigserial('reading_id', { mode: 'number' }).primaryKey(),
  sensorId: integer('sensor_id').notNull().references(() => sensors.sensorId, { onDelete: 'cascade' }),
  value: numeric('value', { precision: 12, scale: 4 }).notNull(),
  quality: varchar('quality', { length: 10 }).default('good'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
});

export const predictions = pgTable('predictions', {
  predictionId: serial('prediction_id').primaryKey(),
  equipmentId: integer('equipment_id').notNull().references(() => equipment.equipmentId, { onDelete: 'cascade' }),
  component: varchar('component', { length: 100 }),
  failureProbability: numeric('failure_probability', { precision: 4, scale: 3 }).notNull(),
  windowDays: integer('window_days'),
  modelVersion: varchar('model_version', { length: 50 }),
  explanation: text('explanation'),
  features: jsonb('features'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const maintenanceOrders = pgTable('maintenance_orders', {
  orderId: serial('order_id').primaryKey(),
  equipmentId: integer('equipment_id').notNull().references(() => equipment.equipmentId),
  predictionId: integer('prediction_id').references(() => predictions.predictionId),
  scheduledDate: timestamp('scheduled_date', { withTimezone: true }),
  technicianId: integer('technician_id').references(() => users.userId),
  parts: jsonb('parts').default(sql`'[]'::jsonb`),
  estimatedDowntimeH: numeric('estimated_downtime_h', { precision: 6, scale: 2 }),
  status: varchar('status', { length: 20 }).default('planned'),
  priority: varchar('priority', { length: 10 }).default('medium'),
  notes: text('notes'),
  requiresHitl: boolean('requires_hitl').default(false),
  approvedBy: integer('approved_by').references(() => users.userId),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const kbMaintenance = pgTable('kb_maintenance', {
  docId: serial('doc_id').primaryKey(),
  title: varchar('title', { length: 300 }).notNull(),
  category: varchar('category', { length: 80 }),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  embeddingIdx: index('idx_kb_maintenance_embedding').using('ivfflat', sql`${t.embedding} vector_cosine_ops`),
}));

export const auditLog = pgTable('audit_log', {
  auditId: bigserial('audit_id', { mode: 'number' }).primaryKey(),
  userId: integer('user_id').references(() => users.userId),
  action: varchar('action', { length: 60 }).notNull(),
  module: varchar('module', { length: 60 }).notNull(),
  entityType: varchar('entity_type', { length: 60 }),
  entityId: varchar('entity_id', { length: 60 }),
  payload: jsonb('payload'),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const modelMetrics = pgTable('model_metrics', {
  metricId: bigserial('metric_id', { mode: 'number' }).primaryKey(),
  modelVersion: varchar('model_version', { length: 50 }),
  metricName: varchar('metric_name', { length: 60 }),
  metricValue: numeric('metric_value', { precision: 10, scale: 4 }),
  windowStart: timestamp('window_start', { withTimezone: true }),
  windowEnd: timestamp('window_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const businessKpis = pgTable('business_kpis', {
  kpiId: bigserial('kpi_id', { mode: 'number' }).primaryKey(),
  kpiName: varchar('kpi_name', { length: 80 }),
  kpiValue: numeric('kpi_value', { precision: 14, scale: 4 }),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
