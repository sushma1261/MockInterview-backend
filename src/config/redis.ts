import Redis, { RedisOptions } from "ioredis";

/**
 * Singleton Redis Client Manager
 * Ensures only one Redis connection exists across the application
 */
class RedisClient {
  private static instance: Redis | null = null;
  private static isInitialized = false;

  private constructor() {
    // Private constructor prevents direct instantiation
  }

  /**
   * Get the singleton Redis client instance
   * Creates the client on first call, returns cached instance on subsequent calls
   */
  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      console.log("🔷 Initializing Redis client...");

      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

      const options: RedisOptions = {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err) => {
          const targetError = "READONLY";
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        },
      };

      RedisClient.instance = new Redis(redisUrl, options);

      // Event listeners
      RedisClient.instance.on("connect", () => {
        if (!RedisClient.isInitialized) {
          console.log("✅ Redis connected successfully");
          RedisClient.isInitialized = true;
        }
      });

      RedisClient.instance.on("error", (err) => {
        console.error("❌ Redis connection error:", err);
      });

      RedisClient.instance.on("reconnecting", () => {
        console.log("🔄 Redis reconnecting...");
      });

      RedisClient.instance.on("close", () => {
        console.log("🔌 Redis connection closed");
      });

      console.log("✅ Redis client initialized");
    }

    return RedisClient.instance;
  }

  /**
   * Close the Redis connection gracefully
   * Useful for graceful shutdown
   */
  public static async closeConnection(): Promise<void> {
    if (RedisClient.instance) {
      console.log("🔌 Closing Redis connection...");
      await RedisClient.instance.quit();
      RedisClient.instance = null;
      RedisClient.isInitialized = false;
      console.log("✅ Redis connection closed");
    }
  }

  /**
   * Check if Redis client is initialized
   */
  public static isClientInitialized(): boolean {
    return RedisClient.instance !== null;
  }

  /**
   * Force disconnect (for emergency situations)
   */
  public static disconnect(): void {
    if (RedisClient.instance) {
      console.log("⚠️  Force disconnecting Redis...");
      RedisClient.instance.disconnect();
      RedisClient.instance = null;
      RedisClient.isInitialized = false;
    }
  }
}

// Export singleton instance
export default RedisClient.getInstance();

// Export utility functions
export const getRedisClient = RedisClient.getInstance;
export const closeRedisConnection = RedisClient.closeConnection;
export const isRedisInitialized = RedisClient.isClientInitialized;
export const disconnectRedis = RedisClient.disconnect;
