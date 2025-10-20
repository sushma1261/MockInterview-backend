import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { Embeddings } from "@langchain/core/embeddings";
import { Pool } from "pg";
import { getDBPool } from "../db/pool";
import { getTextEmbeddingsAPI } from "../utils/chatUtils";

/**
 * Service for managing PGVectorStore singleton instance
 * Provides centralized access to the vector store for resume embeddings
 */
export class VectorStoreService {
  private static instance: PGVectorStore | null = null;
  private static readonly TABLE_NAME = "resume_chunks";

  /**
   * Get or create singleton vector store instance
   * @returns Promise<PGVectorStore> - The shared vector store instance
   */
  static async getInstance(): Promise<PGVectorStore> {
    if (!VectorStoreService.instance) {
      console.log("🔧 Creating new vector store instance...");
      VectorStoreService.instance = await VectorStoreService.initialize();
    }
    return VectorStoreService.instance;
  }

  /**
   * Initialize PGVectorStore with configuration
   * @private
   */
  private static async initialize(): Promise<PGVectorStore> {
    const pool = getDBPool();
    const embeddings = getTextEmbeddingsAPI();

    console.log(
      `Initializing PGVectorStore with table: ${VectorStoreService.TABLE_NAME}`
    );

    return PGVectorStore.initialize(embeddings, {
      pool,
      tableName: VectorStoreService.TABLE_NAME,
      columns: {
        idColumnName: "id",
        vectorColumnName: "embedding",
        contentColumnName: "text",
        metadataColumnName: "metadata",
      },
    });
  }

  /**
   * Initialize vector store with custom pool and embeddings
   * Useful for testing or custom configurations
   * @param pool - PostgreSQL connection pool
   * @param embeddings - Embeddings API instance
   */
  static async initializeWithCustomConfig(
    pool: Pool,
    embeddings: Embeddings
  ): Promise<PGVectorStore> {
    console.log(
      `Initializing PGVectorStore with custom config, table: ${VectorStoreService.TABLE_NAME}`
    );

    return PGVectorStore.initialize(embeddings, {
      pool,
      tableName: VectorStoreService.TABLE_NAME,
      columns: {
        idColumnName: "id",
        vectorColumnName: "embedding",
        contentColumnName: "text",
        metadataColumnName: "metadata",
      },
    });
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static reset(): void {
    VectorStoreService.instance = null;
    console.log("🔄 Vector store instance reset");
  }

  /**
   * Check if instance is initialized
   */
  static isInitialized(): boolean {
    return VectorStoreService.instance !== null;
  }

  /**
   * Get the table name used by the vector store
   */
  static getTableName(): string {
    return VectorStoreService.TABLE_NAME;
  }
}
