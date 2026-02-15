import { Pool, PoolConfig } from "pg";

/**
 * Singleton Database Pool Manager
 * Ensures only one PostgreSQL connection pool exists across the application
 */
class DatabasePool {
  private static instance: Pool | null = null;
  private static isInitialized = false;

  private constructor() {
    // Private constructor prevents direct instantiation
  }

  /**
   * Get the singleton database pool instance
   * Creates the pool on first call, returns cached instance on subsequent calls
   */
  public static getInstance(): Pool {
    if (!DatabasePool.instance) {
      console.log("🔷 Initializing PostgreSQL connection pool...");

      const config: PoolConfig =
        process.env.NODE_ENV === "production"
          ? {
              connectionString: process.env.DATABASE_URL,
              ssl: {
                rejectUnauthorized: false,
              },
            }
          : {
              host: process.env.POSTGRES_HOST || "localhost",
              port: Number(process.env.POSTGRES_PORT) || 5432,
              user: process.env.POSTGRES_USER,
              password: process.env.POSTGRES_PASSWORD,
              database: process.env.POSTGRES_DB,
            };

      DatabasePool.instance = new Pool(config);
      DatabasePool.isInitialized = true;

      // Log successful connection
      DatabasePool.instance.on("connect", () => {
        if (!DatabasePool.isInitialized) {
          console.log("✅ PostgreSQL pool connected successfully");
          DatabasePool.isInitialized = true;
        }
      });

      // Log errors
      DatabasePool.instance.on("error", (err) => {
        console.error("❌ PostgreSQL pool error:", err);
      });

      console.log(
        `✅ PostgreSQL pool initialized (${
          process.env.NODE_ENV || "development"
        } mode)`
      );
    }

    return DatabasePool.instance;
  }

  /**
   * Close the database pool and cleanup connections
   * Useful for graceful shutdown
   */
  public static async closePool(): Promise<void> {
    if (DatabasePool.instance) {
      console.log("🔌 Closing PostgreSQL connection pool...");
      await DatabasePool.instance.end();
      DatabasePool.instance = null;
      DatabasePool.isInitialized = false;
      console.log("✅ PostgreSQL pool closed");
    }
  }

  /**
   * Check if pool is initialized
   */
  public static isPoolInitialized(): boolean {
    return DatabasePool.instance !== null;
  }
}

// Export singleton instance
export default DatabasePool.getInstance();

// Export utility functions
export const getDBPool = DatabasePool.getInstance;
export const closeDBPool = DatabasePool.closePool;
export const isDBPoolInitialized = DatabasePool.isPoolInitialized;
