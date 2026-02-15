import { Redis } from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { getRedisClient } from "../config/redis";
import { ScreeningPreviewResult } from "../types/recruitment";

/**
 * Screening Cache Service
 * Stores temporary screening preview results in Redis
 */
export class ScreeningCacheService {
  private redis: Redis;
  private readonly TTL = 300; // 5 minutes
  private readonly PREFIX = "screening:";

  constructor() {
    // Use singleton Redis client
    this.redis = getRedisClient();
  }

  /**
   * Save screening results temporarily
   */
  async saveScreeningResults(
    jobId: number,
    results: Partial<ScreeningPreviewResult>
  ): Promise<string> {
    const screeningId = `temp-${uuidv4()}`;
    const key = `${this.PREFIX}${screeningId}`;

    const data = {
      job_id: jobId,
      ...results,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.TTL * 1000).toISOString(),
    };

    await this.redis.setex(key, this.TTL, JSON.stringify(data));

    console.log(
      `💾 Saved screening preview: ${screeningId} (expires in ${this.TTL}s)`
    );
    return screeningId;
  }

  /**
   * Retrieve screening results
   */
  async getScreeningResults(
    screeningId: string
  ): Promise<ScreeningPreviewResult | null> {
    const key = `${this.PREFIX}${screeningId}`;
    const data = await this.redis.get(key);

    if (!data) {
      console.log(`⚠️ Screening preview not found or expired: ${screeningId}`);
      return null;
    }

    return JSON.parse(data) as ScreeningPreviewResult;
  }

  /**
   * Delete screening results
   */
  async deleteScreeningResults(screeningId: string): Promise<void> {
    const key = `${this.PREFIX}${screeningId}`;
    await this.redis.del(key);
    console.log(`🗑️ Deleted screening preview: ${screeningId}`);
  }

  /**
   * Check if screening results exist
   */
  async existsScreeningResults(screeningId: string): Promise<boolean> {
    const key = `${this.PREFIX}${screeningId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Extend TTL for screening results
   */
  async extendScreeningResults(
    screeningId: string,
    additionalSeconds: number = 300
  ): Promise<boolean> {
    const key = `${this.PREFIX}${screeningId}`;
    const exists = await this.redis.exists(key);

    if (exists === 1) {
      await this.redis.expire(key, additionalSeconds);
      console.log(
        `⏰ Extended screening preview TTL: ${screeningId} (+${additionalSeconds}s)`
      );
      return true;
    }

    return false;
  }

  /**
   * Close Redis connection (no-op since we use shared singleton)
   * @deprecated Redis connection is managed by the singleton client
   */
  async close(): Promise<void> {
    // No-op: shared Redis client is closed on app shutdown
    console.log(
      "ℹ️  ScreeningCacheService uses shared Redis client (not closing)"
    );
  }
}
