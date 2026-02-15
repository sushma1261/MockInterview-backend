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

    return VectorStoreService.initializeWithCustomConfig(pool, embeddings);
  }
  static async initializeWithCustomConfig(
    pool: Pool,
    embeddings: Embeddings
  ): Promise<PGVectorStore> {
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
}
