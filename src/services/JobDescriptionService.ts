import pool from "../db/pool";
import {
  CreateJobDescriptionDTO,
  ForbiddenError,
  JobDescription,
  JobStatus,
  NotFoundError,
  ScreeningConfig,
  UpdateJobDescriptionDTO,
  ValidationError,
} from "../types/recruitment";
import { cacheDel, cacheGet, cacheSet } from "../utils/cache";

export class JobDescriptionService {
  private static instance: JobDescriptionService;

  private constructor() {}

  public static getInstance(): JobDescriptionService {
    if (!JobDescriptionService.instance) {
      JobDescriptionService.instance = new JobDescriptionService();
    }
    return JobDescriptionService.instance;
  }

  async createJobDescription(
    hrUserId: number,
    data: CreateJobDescriptionDTO
  ): Promise<JobDescription> {
    if (!data.title || !data.description)
      throw new ValidationError("Title and description are required");

    const defaultConfig: ScreeningConfig = {
      max_candidates: 10,
      similarity_threshold: 0.6,
      application_threshold: 60,
    };
    const screeningConfig = { ...defaultConfig, ...data.screening_config };

    const query = `INSERT INTO job_descriptions (user_id, hr_user_id, title, company_name, description, requirements, required_skills, required_experience_years, positions_available, status, screening_config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`;
    const values = [
      hrUserId,
      hrUserId,
      data.title,
      data.company_name || null,
      data.description,
      data.requirements || null,
      data.required_skills || null,
      data.required_experience_years || null,
      data.positions_available || 1,
      JobStatus.DRAFT,
      JSON.stringify(screeningConfig),
    ];

    const result = await pool.query(query, values);
    const job = this.mapJobDescription(result.rows[0]);
    await cacheDel(`jobs:list`);
    await cacheDel(`job:${job.id}`);
    console.log(`✅ Created job description: ${job.title} (ID: ${job.id})`);
    return job;
  }

  async getJobDescription(id: number): Promise<JobDescription> {
    const cacheKey = `job:${id}`;
    const cached = await cacheGet<JobDescription>(cacheKey);
    if (cached) return cached;

    const query = `SELECT * FROM job_descriptions WHERE id = $1`;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) throw new NotFoundError("Job description");
    const job = this.mapJobDescription(result.rows[0]);
    await cacheSet(cacheKey, job, 60);
    return job;
  }

  async updateJobDescription(
    id: number,
    hrUserId: number,
    data: UpdateJobDescriptionDTO
  ): Promise<JobDescription> {
    const existing = await this.getJobDescription(id);
    if (existing.hr_user_id !== hrUserId)
      throw new ForbiddenError("You can only update your own job postings");

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.company_name !== undefined) {
      updates.push(`company_name = $${paramIndex++}`);
      values.push(data.company_name);
    }
    if (data.requirements !== undefined) {
      updates.push(`requirements = $${paramIndex++}`);
      values.push(data.requirements);
    }
    if (data.required_skills !== undefined) {
      updates.push(`required_skills = $${paramIndex++}`);
      values.push(data.required_skills);
    }
    if (data.required_experience_years !== undefined) {
      updates.push(`required_experience_years = $${paramIndex++}`);
      values.push(data.required_experience_years);
    }
    if (data.positions_available !== undefined) {
      updates.push(`positions_available = $${paramIndex++}`);
      values.push(data.positions_available);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.screening_config !== undefined) {
      const merged = { ...existing.screening_config, ...data.screening_config };
      updates.push(`screening_config = $${paramIndex++}`);
      values.push(JSON.stringify(merged));
    }

    if (updates.length === 0) return existing;
    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE job_descriptions SET ${updates.join(
      ", "
    )} WHERE id = $${paramIndex} RETURNING *`;
    const result = await pool.query(query, values);
    const job = this.mapJobDescription(result.rows[0]);
    await cacheDel(`jobs:list`);
    await cacheDel(`job:${id}`);
    console.log(`✅ Updated job description: ${id}`);
    return job;
  }

  async listJobDescriptions(
    filters: {
      hrUserId?: number;
      status?: JobStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ jobs: JobDescription[]; total: number }> {
    const cacheKey = `jobs:list:hr_${filters.hrUserId || "all"}:status_${
      filters.status || "all"
    }:limit_${filters.limit || 50}:offset_${filters.offset || 0}`;
    const cached = await cacheGet<{ jobs: JobDescription[]; total: number }>(
      cacheKey
    );
    if (cached) return cached;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    if (filters.hrUserId) {
      conditions.push(`hr_user_id = $${paramIndex++}`);
      values.push(filters.hrUserId);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) FROM job_descriptions ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    values.push(limit, offset);

    const query = `SELECT * FROM job_descriptions ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const result = await pool.query(query, values);
    const jobs = result.rows.map((row) => this.mapJobDescription(row));
    const payload = { jobs, total };
    await cacheSet(cacheKey, payload, 60);
    return payload;
  }

  async deleteJobDescription(id: number, hrUserId: number): Promise<void> {
    const existing = await this.getJobDescription(id);
    if (existing.hr_user_id !== hrUserId)
      throw new ForbiddenError("You can only delete your own job postings");
    const query = `DELETE FROM job_descriptions WHERE id = $1`;
    await pool.query(query, [id]);
    await cacheDel(`jobs:list`);
    await cacheDel(`job:${id}`);
    console.log(`🗑️ Deleted job description: ${id}`);
  }

  async updateJobStatus(
    id: number,
    hrUserId: number,
    status: JobStatus
  ): Promise<JobDescription> {
    return this.updateJobDescription(id, hrUserId, { status });
  }

  async getJobStatistics(jobId: number) {
    const query = `SELECT * FROM job_applications_summary WHERE job_id = $1`;
    const result = await pool.query(query, [jobId]);
    if (result.rows.length === 0) {
      const job = await this.getJobDescription(jobId);
      return {
        job_id: job.id,
        job_title: job.title,
        job_status: job.status,
        total_applications: 0,
        pending_review: 0,
        shortlisted: 0,
        interviewed: 0,
        hired: 0,
        rejected: 0,
        average_score: 0,
        top_score: 0,
      };
    }
    return result.rows[0];
  }

  private mapJobDescription(row: any): JobDescription {
    return {
      id: row.id,
      user_id: row.user_id,
      hr_user_id: row.hr_user_id,
      title: row.title,
      company_name: row.company_name,
      description: row.description,
      requirements: row.requirements,
      required_skills: row.required_skills,
      required_experience_years: row.required_experience_years,
      positions_available: row.positions_available,
      status: row.status as JobStatus,
      screening_config:
        typeof row.screening_config === "string"
          ? JSON.parse(row.screening_config)
          : row.screening_config,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
