import { Redis } from "ioredis";
import { RedisSessionStore } from "./RedisSessionStore";

/**
 * Background service to cleanup stale sessions and manage memory
 */
export class SessionCleanupScheduler {
  private redisStore: RedisSessionStore;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_IDLE_MINUTES = 30; // Sessions idle for >30min are cleaned

  constructor(redis: Redis) {
    this.redisStore = RedisSessionStore.getInstance(redis);
  }

  /**
   * Start the cleanup scheduler
   */
  start(): void {
    if (this.cleanupInterval) {
      console.log("⚠️  Cleanup scheduler already running");
      return;
    }

    console.log(
      `🧹 Starting session cleanup scheduler (interval: ${
        this.CLEANUP_INTERVAL_MS / 1000 / 60
      }min)`
    );

    // Run immediately on start
    this.runCleanup();

    // Then run periodically
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup scheduler
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log("🛑 Stopped session cleanup scheduler");
    }
  }

  /**
   * Run cleanup task
   */
  private async runCleanup(): Promise<void> {
    try {
      console.log("🧹 Running session cleanup...");

      const cleaned = await this.redisStore.cleanupStaleSessions(
        this.MAX_IDLE_MINUTES
      );

      const stats = await this.redisStore.getSessionStats();

      console.log(
        `✅ Cleanup complete: ${cleaned} stale sessions removed. Active: ${stats.activeSessions}, Conversations: ${stats.totalConversations}`
      );
    } catch (error) {
      console.error("❌ Error during session cleanup:", error);
    }
  }

  /**
   * Get cleanup status
   */
  isRunning(): boolean {
    return this.cleanupInterval !== null;
  }

  /**
   * Force cleanup now
   */
  async forceCleanup(): Promise<number> {
    console.log("🧹 Force cleanup triggered");
    const cleaned = await this.redisStore.cleanupStaleSessions(
      this.MAX_IDLE_MINUTES
    );
    return cleaned;
  }
}
