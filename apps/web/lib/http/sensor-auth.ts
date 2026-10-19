import { NextRequest } from 'next/server';

const SENSOR_API_KEY = process.env.SENSOR_API_KEY ?? 'sensor_key_change_me';

// Basic in-memory rate limiter (window 60s / 600 req per key)
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateLimit(key: string, limit = 600, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function assertSensorAuth(req: NextRequest) {
  const key = req.headers.get('x-sensor-key');
  if (!key || key !== SENSOR_API_KEY) {
    const e = new Error('Invalid sensor API key');
    (e as any).status = 401;
    throw e;
  }
  if (!rateLimit(key)) {
    const e = new Error('Rate limit exceeded');
    (e as any).status = 429;
    throw e;
  }
}
