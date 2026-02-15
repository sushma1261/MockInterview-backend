import { Redis } from "ioredis";
import { getRedisClient } from "../config/redis";

// Use singleton Redis client
export const redisClient: Redis = getRedisClient();

/**
 * Get value from cache and JSON-parse it.
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  const val = await redisClient.get(key);
  if (!val) return null;
  try {
    return JSON.parse(val) as T;
  } catch (e) {
    return val as unknown as T;
  }
}

/**
 * Set value in cache with TTL in seconds. Serializes value.
 */
export async function cacheSet(
  key: string,
  value: any,
  ttlSeconds = 60
): Promise<void> {
  const payload = typeof value === "string" ? value : JSON.stringify(value);
  if (ttlSeconds > 0) {
    await redisClient.set(key, payload, "EX", ttlSeconds);
  } else {
    await redisClient.set(key, payload);
  }
}

/**
 * Delete cache key
 */
export async function cacheDel(key: string): Promise<void> {
  await redisClient.del(key);
}

export default redisClient;
