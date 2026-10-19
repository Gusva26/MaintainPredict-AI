export type Role = 'technician' | 'supervisor' | 'planner' | 'admin';

export type EquipmentCriticality = 'low' | 'medium' | 'high' | 'critical';
export type EquipmentStatus = 'operational' | 'maintenance' | 'down' | 'retired';

export type SensorType = 'vibration' | 'temperature' | 'pressure' | 'current' | 'rpm';
export type SensorStatus = 'active' | 'inactive' | 'faulty';
export type ReadingQuality = 'good' | 'suspect' | 'bad';

export type OrderStatus = 'planned' | 'pending_approval' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
export type OrderPriority = 'low' | 'medium' | 'high' | 'critical';

export interface UserDTO {
  userId: number;
  email: string;
  fullName: string;
  role: Role;
  phone?: string | null;
  isActive: boolean;
}

export interface EquipmentDTO {
  equipmentId: number;
  name: string;
  type: string;
  location?: string | null;
  criticality: EquipmentCriticality;
  installationDate?: string | null;
  status: EquipmentStatus;
  downtimeCostEurH: number;
}

export interface SensorDTO {
  sensorId: number;
  equipmentId: number;
  type: SensorType;
  unit?: string | null;
  status: SensorStatus;
  minThreshold?: number | null;
  maxThreshold?: number | null;
}

export interface ReadingDTO {
  readingId: number;
  sensorId: number;
  value: number;
  quality: ReadingQuality;
  recordedAt: string;
}

export interface PredictionDTO {
  predictionId: number;
  equipmentId: number;
  component?: string | null;
  failureProbability: number;
  windowDays?: number | null;
  modelVersion?: string | null;
  explanation?: string | null;
  features?: Record<string, unknown> | null;
  createdAt: string;
}

export interface MaintenanceOrderDTO {
  orderId: number;
  equipmentId: number;
  predictionId?: number | null;
  scheduledDate?: string | null;
  technicianId?: number | null;
  parts?: Array<{ sku: string; name?: string; qty: number; lead_days?: number }> | null;
  estimatedDowntimeH?: number | null;
  status: OrderStatus;
  priority: OrderPriority;
  notes?: string | null;
  requiresHitl: boolean;
  approvedBy?: number | null;
  approvedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  data: T;
  explanation?: {
    what: string;
    how: string;
    decision: string;
  } | null;
  error?: string | null;
}
