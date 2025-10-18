import { Pool } from "pg";

/**
 * Service for managing resume chunks in the vector store
 * Handles operations on the resume_chunks table
 */
export class ResumeChunkService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get all chunks for a specific resume
   */
  async getChunksByResumeId(resumeId: number): Promise<any[]> {
    const query = `
      SELECT id, resume_id, chunk_index, text, metadata, created_at
      FROM resume_chunks
      WHERE resume_id = $1
      ORDER BY chunk_index ASC
    `;

    const result = await this.pool.query(query, [resumeId]);
    return result.rows;
  }

  /**
   * Get total count of chunks for a resume
   */
  async getChunkCount(resumeId: number): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM resume_chunks
      WHERE resume_id = $1
    `;

    const result = await this.pool.query(query, [resumeId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * Delete all chunks for a specific resume
   * Note: This happens automatically via CASCADE when resume is deleted
   */
  async deleteChunksByResumeId(resumeId: number): Promise<number> {
    const query = `
      DELETE FROM resume_chunks
      WHERE resume_id = $1
    `;

    const result = await this.pool.query(query, [resumeId]);
    return result.rowCount || 0;
  }

  /**
   * Get chunks for multiple resumes (useful for bulk operations)
   */
  async getChunksByResumeIds(resumeIds: number[]): Promise<any[]> {
    const query = `
      SELECT id, resume_id, chunk_index, text, metadata, created_at
      FROM resume_chunks
      WHERE resume_id = ANY($1)
      ORDER BY resume_id, chunk_index ASC
    `;

    const result = await this.pool.query(query, [resumeIds]);
    return result.rows;
  }

  /**
   * Get statistics about chunks across all resumes for a user
   */
  async getUserChunkStats(userId: number): Promise<{
    total_chunks: number;
    resumes_with_chunks: number;
    avg_chunks_per_resume: number;
  }> {
    const query = `
      SELECT 
        COUNT(rc.id) as total_chunks,
        COUNT(DISTINCT rc.resume_id) as resumes_with_chunks,
        COALESCE(AVG(chunk_counts.chunk_count), 0) as avg_chunks_per_resume
      FROM resumes r
      LEFT JOIN resume_chunks rc ON r.id = rc.resume_id
      LEFT JOIN (
        SELECT resume_id, COUNT(*) as chunk_count
        FROM resume_chunks
        GROUP BY resume_id
      ) chunk_counts ON r.id = chunk_counts.resume_id
      WHERE r.user_id = $1
    `;

    const result = await this.pool.query(query, [userId]);
    return {
      total_chunks: parseInt(result.rows[0].total_chunks) || 0,
      resumes_with_chunks: parseInt(result.rows[0].resumes_with_chunks) || 0,
      avg_chunks_per_resume:
        parseFloat(result.rows[0].avg_chunks_per_resume) || 0,
    };
  }

  /**
   * Reconstruct full resume text from chunks
   * Returns chunks in order without overlap removal
   */
  async reconstructResumeText(resumeId: number): Promise<string> {
    const chunks = await this.getChunksByResumeId(resumeId);
    return chunks.map((chunk) => chunk.text).join("\n");
  }

  /**
   * Search for resumes containing specific text
   * Uses PostgreSQL full-text search on chunk text
   */
  async searchChunks(
    searchText: string,
    userId?: number,
    limit: number = 10
  ): Promise<any[]> {
    const query = userId
      ? `
      SELECT rc.*, r.title as resume_title, r.file_name
      FROM resume_chunks rc
      JOIN resumes r ON rc.resume_id = r.id
      WHERE r.user_id = $1 AND rc.text ILIKE $2
      ORDER BY rc.created_at DESC
      LIMIT $3
    `
      : `
      SELECT rc.*, r.title as resume_title, r.file_name
      FROM resume_chunks rc
      JOIN resumes r ON rc.resume_id = r.id
      WHERE rc.text ILIKE $1
      ORDER BY rc.created_at DESC
      LIMIT $2
    `;

    const params = userId
      ? [userId, `%${searchText}%`, limit]
      : [`%${searchText}%`, limit];

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get orphaned chunks (chunks without a resume)
   * This shouldn't happen due to CASCADE, but useful for debugging
   */
  async getOrphanedChunks(): Promise<any[]> {
    const query = `
      SELECT rc.*
      FROM resume_chunks rc
      LEFT JOIN resumes r ON rc.resume_id = r.id
      WHERE r.id IS NULL
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }
}
