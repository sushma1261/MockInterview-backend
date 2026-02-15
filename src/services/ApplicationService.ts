import pool from "../db/pool";
import {
  ApplicationWithDetails,
  CreateApplicationDTO,
  HRStatus,
  NotFoundError,
  ResumeApplication,
  ScreeningStatus,
  UpdateApplicationDTO,
  ValidationError,
} from "../types/recruitment";
import { cacheDel, cacheGet, cacheSet } from "../utils/cache";

/**
 * Application Service
 * Handles resume applications (selected candidates after screening)
 */
export class ApplicationService {
  /**
   * Create a single application
   */
  async createApplication(
    data: CreateApplicationDTO
  ): Promise<ResumeApplication> {
    const query = `
      INSERT INTO resume_applications (
        job_description_id,
        resume_id,
        applicant_user_id,
        ai_match_score,
        screening_analysis,
        screening_status,
        screening_date
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;

    const values = [
      data.job_description_id,
      data.resume_id,
      data.applicant_user_id,
      data.ai_match_score,
      JSON.stringify(data.screening_analysis),
      this.getScreeningStatusFromScore(data.ai_match_score),
    ];

    try {
      const result = await pool.query(query, values);
      const created = this.mapApplication(result.rows[0]);
      // Invalidate application lists for the job
      await cacheDel(`applications:job:${created.job_description_id}`);
      return created;
    } catch (error: any) {
      if (error.code === "23505") {
        // Unique constraint violation
        throw new ValidationError(
          "This candidate has already been added to this job"
        );
      }
      throw error;
    }
  }

  /**
   * Create multiple applications at once (from screening results)
   */
  async createApplicationsBatch(
    applications: CreateApplicationDTO[]
  ): Promise<ResumeApplication[]> {
    if (applications.length === 0) {
      return [];
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const results: ResumeApplication[] = [];

      for (const app of applications) {
        const query = `
          INSERT INTO resume_applications (
            job_description_id,
            resume_id,
            applicant_user_id,
            ai_match_score,
            screening_analysis,
            screening_status,
            screening_date
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (job_description_id, resume_id) DO NOTHING
          RETURNING *
        `;

        const values = [
          app.job_description_id,
          app.resume_id,
          app.applicant_user_id,
          app.ai_match_score,
          JSON.stringify(app.screening_analysis),
          this.getScreeningStatusFromScore(app.ai_match_score),
        ];

        const result = await client.query(query, values);
        if (result.rows.length > 0) {
          results.push(this.mapApplication(result.rows[0]));
        }
      }

      await client.query("COMMIT");
      console.log(`✅ Created ${results.length} applications`);
      // Invalidate cache for affected jobs
      const jobIds = Array.from(
        new Set(results.map((r) => r.job_description_id))
      );
      for (const jid of jobIds) {
        await cacheDel(`applications:job:${jid}`);
      }
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating applications batch:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get application by ID
   */
  async getApplication(id: number): Promise<ResumeApplication> {
    const query = `SELECT * FROM resume_applications WHERE id = $1`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new NotFoundError("Application");
    }

    return this.mapApplication(result.rows[0]);
  }

  /**
   * Get application with full details (candidate, resume, job info)
   */
  async getApplicationWithDetails(id: number): Promise<ApplicationWithDetails> {
    const query = `
      SELECT 
        ra.*,
        up.email as candidate_email,
        up.display_name as candidate_name,
        up.photo_url as candidate_photo,
        r.title as resume_title,
        r.file_name as resume_file_name,
        jd.title as job_title,
        jd.company_name as job_company
      FROM resume_applications ra
      JOIN user_profiles up ON ra.applicant_user_id = up.id
      JOIN resumes r ON ra.resume_id = r.id
      JOIN job_descriptions jd ON ra.job_description_id = jd.id
      WHERE ra.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new NotFoundError("Application");
    }

    return this.mapApplicationWithDetails(result.rows[0]);
  }

  /**
   * Get applications for a job
   */
  async getApplicationsByJob(
    jobId: number,
    filters: {
      minScore?: number;
      screeningStatus?: ScreeningStatus;
      hrStatus?: HRStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ applications: ApplicationWithDetails[]; total: number }> {
    const conditions = [`ra.job_description_id = $1`];
    const values: any[] = [jobId];
    let paramIndex = 2;

    if (filters.minScore !== undefined) {
      conditions.push(`ra.ai_match_score >= $${paramIndex++}`);
      values.push(filters.minScore);
    }

    if (filters.screeningStatus) {
      conditions.push(`ra.screening_status = $${paramIndex++}`);
      values.push(filters.screeningStatus);
    }

    if (filters.hrStatus) {
      conditions.push(`ra.hr_status = $${paramIndex++}`);
      values.push(filters.hrStatus);
    }

    const whereClause = conditions.join(" AND ");

    const cacheKey = `applications:job:${jobId}:min_${
      filters.minScore || "all"
    }:screen_${filters.screeningStatus || "all"}:hr_${
      filters.hrStatus || "all"
    }:limit_${filters.limit || 50}:offset_${filters.offset || 0}`;
    const cached = await cacheGet<{
      applications: ApplicationWithDetails[];
      total: number;
    }>(cacheKey);
    if (cached) return cached;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM resume_applications ra WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get applications
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    values.push(limit, offset);

    const query = `
      SELECT 
        ra.*,
        up.email as candidate_email,
        up.display_name as candidate_name,
        up.photo_url as candidate_photo,
        r.title as resume_title,
        r.file_name as resume_file_name,
        jd.title as job_title,
        jd.company_name as job_company
      FROM resume_applications ra
      JOIN user_profiles up ON ra.applicant_user_id = up.id
      JOIN resumes r ON ra.resume_id = r.id
      JOIN job_descriptions jd ON ra.job_description_id = jd.id
      WHERE ${whereClause}
      ORDER BY ra.ai_match_score DESC, ra.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const result = await pool.query(query, values);
    const applications = result.rows.map((row) =>
      this.mapApplicationWithDetails(row)
    );
    const payload = { applications, total };
    await cacheSet(cacheKey, payload, 30);
    return payload;
  }

  /**
   * Update application status
   */
  async updateApplication(
    id: number,
    hrUserId: number,
    data: UpdateApplicationDTO
  ): Promise<ResumeApplication> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.screening_status !== undefined) {
      updates.push(`screening_status = $${paramIndex++}`);
      values.push(data.screening_status);
    }

    if (data.hr_status !== undefined) {
      updates.push(`hr_status = $${paramIndex++}`);
      values.push(data.hr_status);

      // Set hr_reviewed_by and hr_reviewed_at when status changes
      updates.push(`hr_reviewed_by = $${paramIndex++}`);
      values.push(hrUserId);
      updates.push(`hr_reviewed_at = NOW()`);
    }

    if (data.hr_notes !== undefined) {
      updates.push(`hr_notes = $${paramIndex++}`);
      values.push(data.hr_notes);
    }

    if (updates.length === 0) {
      return this.getApplication(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE resume_applications
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new NotFoundError("Application");
    }

    console.log(`✅ Updated application: ${id}`);
    // Invalidate application lists for the job
    if (result.rows.length > 0) {
      const jobId = result.rows[0].job_description_id;
      await cacheDel(`applications:job:${jobId}`);
    }
    return this.mapApplication(result.rows[0]);
  }

  /**
   * Shortlist a candidate
   */
  async shortlistCandidate(
    id: number,
    hrUserId: number
  ): Promise<ResumeApplication> {
    return this.updateApplication(id, hrUserId, {
      screening_status: ScreeningStatus.SHORTLISTED,
      hr_status: HRStatus.APPROVED,
    });
  }

  /**
   * Reject a candidate
   */
  async rejectCandidate(
    id: number,
    hrUserId: number,
    reason?: string
  ): Promise<ResumeApplication> {
    return this.updateApplication(id, hrUserId, {
      screening_status: ScreeningStatus.REJECTED,
      hr_status: HRStatus.REJECTED,
      hr_notes: reason,
    });
  }

  /**
   * Delete application
   */
  async deleteApplication(id: number): Promise<void> {
    const query = `DELETE FROM resume_applications WHERE id = $1`;
    await pool.query(query, [id]);
    console.log(`🗑️ Deleted application: ${id}`);
    // Invalidate any job-related application caches — best-effort: try to remove by scanning job id
    // Try to fetch job id (best-effort to invalidate)
    try {
      // This assumes resume_applications had job id before deletion, but we deleted; try to remove generic keys
      // Delete a common prefix pattern is not available directly; leaving placeholder for manual invalidation if needed
    } catch (e) {
      // ignore
    }
  }

  /**
   * Determine screening status from AI score
   */
  private getScreeningStatusFromScore(score: number): ScreeningStatus {
    if (score >= 80) return ScreeningStatus.SHORTLISTED;
    return ScreeningStatus.SCREENED;
  }

  /**
   * Map database row to ResumeApplication type
   */
  private mapApplication(row: any): ResumeApplication {
    return {
      id: row.id,
      job_description_id: row.job_description_id,
      resume_id: row.resume_id,
      applicant_user_id: row.applicant_user_id,
      ai_match_score: parseFloat(row.ai_match_score),
      screening_status: row.screening_status as ScreeningStatus,
      screening_analysis:
        typeof row.screening_analysis === "string"
          ? JSON.parse(row.screening_analysis)
          : row.screening_analysis,
      screening_date: row.screening_date,
      hr_status: row.hr_status as HRStatus,
      hr_notes: row.hr_notes,
      hr_reviewed_by: row.hr_reviewed_by,
      hr_reviewed_at: row.hr_reviewed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Map database row to ApplicationWithDetails type
   */
  private mapApplicationWithDetails(row: any): ApplicationWithDetails {
    const application = this.mapApplication(row);

    return {
      ...application,
      candidate: {
        user_id: row.applicant_user_id,
        email: row.candidate_email,
        display_name: row.candidate_name,
        photo_url: row.candidate_photo,
      },
      resume: {
        id: row.resume_id,
        title: row.resume_title,
        file_name: row.resume_file_name,
      },
      job: {
        id: row.job_description_id,
        title: row.job_title,
        company_name: row.job_company,
      },
    };
  }
}
