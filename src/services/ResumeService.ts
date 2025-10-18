import { Redis } from "ioredis";
import { Pool } from "pg";
import { CreateResumeDTO, Resume, UpdateResumeDTO } from "../types/userProfile";

export class ResumeService {
  private pool: Pool;
  private redis: Redis;
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly RESUME_CACHE_PREFIX = "resume:";
  private readonly USER_RESUMES_CACHE_PREFIX = "user_resumes:";

  constructor(pool: Pool, redis: Redis) {
    this.pool = pool;
    this.redis = redis;
  }

  /**
   * Create a new resume
   */
  async createResume(userId: number, data: CreateResumeDTO): Promise<Resume> {
    // If this resume is set as primary, unset all others
    if (data.is_primary) {
      await this.unsetPrimaryResumes(userId);
    }

    const query = `
      INSERT INTO resumes (
        user_id, title, file_name, file_path, file_size,
        content, file_data, is_primary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      userId,
      data.title,
      data.file_name || null,
      data.file_path || null,
      data.file_size || null,
      data.content || null,
      data.file_data || null, // Store binary PDF data
      data.is_primary || false,
    ];

    const result = await this.pool.query(query, values);
    const resume = result.rows[0];

    // Invalidate user resumes list cache
    await this.invalidateUserResumesCache(userId);

    return resume;
  }

  /**
   * Get resume by ID
   */
  async getResumeById(
    resumeId: number,
    userId: number
  ): Promise<Resume | null> {
    const cacheKey = `${this.RESUME_CACHE_PREFIX}${resumeId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const resume = JSON.parse(cached);
      // Verify ownership
      if (resume.user_id !== userId) return null;
      return resume;
    }

    const query = "SELECT * FROM resumes WHERE id = $1 AND user_id = $2";
    const result = await this.pool.query(query, [resumeId, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const resume = result.rows[0];
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(resume));

    return resume;
  }

  /**
   * Check if a resume with the same filename already exists for the user
   */
  async resumeExistsByFileName(
    userId: number,
    fileName: string
  ): Promise<boolean> {
    const query =
      "SELECT EXISTS(SELECT 1 FROM resumes WHERE user_id = $1 AND file_name = $2)";
    const result = await this.pool.query(query, [userId, fileName]);
    return result.rows[0].exists;
  }

  /**
   * Get all resumes for a user
   */
  async getUserResumes(
    userId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<Resume[]> {
    const cacheKey = `${this.USER_RESUMES_CACHE_PREFIX}${userId}:${limit}:${offset}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const query = `
      SELECT * FROM resumes
      WHERE user_id = $1
      ORDER BY is_primary DESC, created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.pool.query(query, [userId, limit, offset]);
    const resumes = result.rows;

    // Cache for 1 hour
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(resumes));

    return resumes;
  }

  /**
   * Get primary resume for a user
   */
  async getPrimaryResume(userId: number): Promise<Resume | null> {
    const cacheKey = `${this.USER_RESUMES_CACHE_PREFIX}${userId}:primary`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const query = `
      SELECT * FROM resumes
      WHERE user_id = $1 AND is_primary = true
      LIMIT 1
    `;

    const result = await this.pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const resume = result.rows[0];
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(resume));

    return resume;
  }

  /**
   * Update a resume
   */
  async updateResume(
    resumeId: number,
    userId: number,
    data: UpdateResumeDTO
  ): Promise<Resume | null> {
    // If setting as primary, unset all others first
    if (data.is_primary) {
      await this.unsetPrimaryResumes(userId);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }

    if (data.file_name !== undefined) {
      updates.push(`file_name = $${paramIndex}`);
      values.push(data.file_name);
      paramIndex++;
    }

    if (data.file_path !== undefined) {
      updates.push(`file_path = $${paramIndex}`);
      values.push(data.file_path);
      paramIndex++;
    }

    if (data.file_size !== undefined) {
      updates.push(`file_size = $${paramIndex}`);
      values.push(data.file_size);
      paramIndex++;
    }

    if (data.content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      values.push(data.content);
      paramIndex++;
    }

    if (data.file_data !== undefined) {
      updates.push(`file_data = $${paramIndex}`);
      values.push(data.file_data);
      paramIndex++;
    }

    if (data.is_primary !== undefined) {
      updates.push(`is_primary = $${paramIndex}`);
      values.push(data.is_primary);
      paramIndex++;
    }

    if (updates.length === 0) {
      return await this.getResumeById(resumeId, userId);
    }

    values.push(resumeId, userId);
    const query = `
      UPDATE resumes
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    const resume = result.rows[0];
    // Invalidate caches
    await this.invalidateResumeCache(resumeId);
    await this.invalidateUserResumesCache(userId);

    return resume;
  }

  /**
   * Delete a resume
   */
  async deleteResume(resumeId: number, userId: number): Promise<boolean> {
    const query = "DELETE FROM resumes WHERE id = $1 AND user_id = $2";
    const result = await this.pool.query(query, [resumeId, userId]);

    if (result.rowCount === 0) {
      return false;
    }

    // Invalidate caches
    await this.invalidateResumeCache(resumeId);
    await this.invalidateUserResumesCache(userId);

    return true;
  }

  /**
   * Set a resume as primary
   */
  async setPrimaryResume(
    resumeId: number,
    userId: number
  ): Promise<Resume | null> {
    // First verify the resume exists and belongs to user
    const resume = await this.getResumeById(resumeId, userId);
    if (!resume) {
      return null;
    }

    // Unset all other primary resumes
    await this.unsetPrimaryResumes(userId);

    // Set this one as primary
    const query = `
      UPDATE resumes
      SET is_primary = true
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [resumeId, userId]);
    const updatedResume = result.rows[0];

    // Invalidate caches
    await this.invalidateResumeCache(resumeId);
    await this.invalidateUserResumesCache(userId);

    return updatedResume;
  }

  // ==================== Private Helper Methods ====================

  /**
   * Unset all primary resumes for a user
   */
  private async unsetPrimaryResumes(userId: number): Promise<void> {
    const query = `
      UPDATE resumes
      SET is_primary = false
      WHERE user_id = $1 AND is_primary = true
    `;

    await this.pool.query(query, [userId]);
  }

  // ==================== Cache Helper Methods ====================

  private async invalidateResumeCache(resumeId: number): Promise<void> {
    const cacheKey = `${this.RESUME_CACHE_PREFIX}${resumeId}`;
    await this.redis.del(cacheKey);
  }

  private async invalidateUserResumesCache(userId: number): Promise<void> {
    // Delete all cached lists for this user
    const pattern = `${this.USER_RESUMES_CACHE_PREFIX}${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
