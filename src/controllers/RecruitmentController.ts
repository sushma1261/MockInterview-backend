import { Request, Response } from "express";
import { ApplicationService } from "../services/ApplicationService";
import { JobDescriptionService } from "../services/JobDescriptionService";
import { ResumeScreeningService } from "../services/ResumeScreeningService";
import { ScreeningCacheService } from "../services/ScreeningCacheService";
import {
  CreateApplicationDTO,
  CreateJobDescriptionDTO,
  ForbiddenError,
  JobStatus,
  NotFoundError,
  UpdateJobDescriptionDTO,
  ValidationError,
} from "../types/recruitment";

/**
 * Recruitment Controller
 * Handles job descriptions, screening, and application creation
 */
export class RecruitmentController {
  private jobService: JobDescriptionService;
  private screeningService: ResumeScreeningService;
  private cacheService: ScreeningCacheService;
  private applicationService: ApplicationService;

  constructor() {
    this.jobService = JobDescriptionService.getInstance();
    this.screeningService = new ResumeScreeningService();
    this.cacheService = new ScreeningCacheService();
    this.applicationService = new ApplicationService();
  }

  /**
   * POST /api/recruitment/jobs
   * Create a new job description
   */
  createJob = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobData: CreateJobDescriptionDTO = {
        title: req.body.title,
        description: req.body.description,
        required_skills: req.body.required_skills,
        required_experience_years: req.body.required_experience_years,
        screening_config: req.body.screening_config,
      };

      const job = await this.jobService.createJobDescription(
        req.userProfile.id,
        jobData
      );

      res.status(201).json({
        success: true,
        job,
      });
    } catch (error: any) {
      console.error("Error creating job:", error);
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create job" });
    }
  };

  /**
   * GET /api/recruitment/jobs
   * List all job descriptions with filters
   */
  listJobs = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const filters = {
        hr_user_id: req.query.hr_user_id
          ? parseInt(req.query.hr_user_id as string)
          : undefined,
        status: req.query.status as JobStatus,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await this.jobService.listJobDescriptions(filters);

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("Error listing jobs:", error);
      res.status(500).json({ message: "Failed to list jobs" });
    }
  };

  /**
   * GET /api/recruitment/jobs/:id
   * Get a single job description
   */
  getJob = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = parseInt(req.params.id);
      const job = await this.jobService.getJobDescription(jobId);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      res.json({
        success: true,
        job,
      });
    } catch (error: any) {
      console.error("Error getting job:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to get job" });
    }
  };

  /**
   * PUT /api/recruitment/jobs/:id
   * Update a job description
   */
  updateJob = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = parseInt(req.params.id);
      const updateData: UpdateJobDescriptionDTO = {
        title: req.body.title,
        description: req.body.description,
        required_skills: req.body.required_skills,
        required_experience_years: req.body.required_experience_years,
        status: req.body.status,
        screening_config: req.body.screening_config,
      };

      const job = await this.jobService.updateJobDescription(
        jobId,
        req.userProfile.id,
        updateData
      );

      res.json({
        success: true,
        job,
      });
    } catch (error: any) {
      console.error("Error updating job:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof ForbiddenError) {
        return res.status(403).json({ message: error.message });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update job" });
    }
  };

  /**
   * DELETE /api/recruitment/jobs/:id
   * Delete a job description
   */
  deleteJob = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = parseInt(req.params.id);
      await this.jobService.deleteJobDescription(jobId, req.userProfile.id);

      res.json({
        success: true,
        message: "Job deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting job:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof ForbiddenError) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to delete job" });
    }
  };

  /**
   * GET /api/recruitment/jobs/:id/statistics
   * Get job statistics
   */
  getJobStatistics = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = parseInt(req.params.id);
      const stats = await this.jobService.getJobStatistics(jobId);

      res.json({
        success: true,
        statistics: stats,
      });
    } catch (error: any) {
      console.error("Error getting job statistics:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to get statistics" });
    }
  };

  /**
   * POST /api/recruitment/jobs/:id/screen
   * Screen resumes for a job (preview mode)
   */
  screenResumes = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = parseInt(req.params.id);

      // Verify job exists and user has access
      const job = await this.jobService.getJobDescription(jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Get screening config from request or use job defaults
      const config = req.body.screening_config || job.screening_config;

      // Perform screening
      const screeningResult = await this.screeningService.screenAllResumes(
        jobId,
        {
          maxCandidates: config.max_candidates,
          similarityThreshold: config.similarity_threshold,
        }
      );

      // Save to cache for preview
      const screeningId = await this.cacheService.saveScreeningResults(jobId, {
        job_description_id: jobId,
        status: "completed",
        total_resumes_found: screeningResult.total_resumes_found,
        candidates_screened: screeningResult.candidates_screened,
        candidates: screeningResult.candidates.map((c) => ({
          resume_id: c.resume.id,
          user_id: c.resume.user_id,
          candidate_name: undefined,
          candidate_email: undefined,
          resume_title: c.resume.title,
          ai_match_score: c.result.overall_match_score,
          recommendation: c.result.recommendation,
          preview_analysis: {
            matched_skills: c.result.matched_skills,
            missing_skills: c.result.missing_skills,
            strengths: c.result.strengths,
            concerns: c.result.concerns,
          },
          full_analysis: c.result, // Keep full analysis for later
        })),
      });

      res.json({
        success: true,
        screening_id: screeningId,
        preview: screeningResult,
        message:
          "Screening complete. Results stored temporarily. Use screening_id to create applications.",
      });
    } catch (error: any) {
      console.error("Error screening resumes:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to screen resumes" });
    }
  };

  /**
   * GET /api/recruitment/screening/:screeningId
   * Get cached screening results
   */
  getScreeningPreview = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const screeningId = req.params.screeningId;
      const preview = await this.cacheService.getScreeningResults(screeningId);

      if (!preview) {
        return res.status(404).json({
          message:
            "Screening results not found or expired. Please run screening again.",
        });
      }

      res.json({
        success: true,
        preview,
      });
    } catch (error: any) {
      console.error("Error getting screening preview:", error);
      res.status(500).json({ message: "Failed to get screening preview" });
    }
  };

  /**
   * POST /api/recruitment/jobs/:id/applications/create
   * Create applications from screening results
   */
  createApplicationsFromScreening = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = parseInt(req.params.id);
      const { screening_id, selected_resume_ids, min_score } = req.body;

      if (!screening_id) {
        return res.status(400).json({ message: "screening_id is required" });
      }

      // Get screening results from cache
      const screeningResults = await this.cacheService.getScreeningResults(
        screening_id
      );

      if (!screeningResults) {
        return res.status(404).json({
          message:
            "Screening results not found or expired. Please run screening again.",
        });
      }

      // Verify job ID matches
      if (screeningResults.job_description_id !== jobId) {
        return res.status(400).json({
          message: "Screening results do not match job ID",
        });
      }

      // Filter candidates based on selection
      let candidatesToSave = screeningResults.candidates;

      // If specific resume IDs provided, filter to those
      if (selected_resume_ids && Array.isArray(selected_resume_ids)) {
        candidatesToSave = candidatesToSave.filter((c) =>
          selected_resume_ids.includes(c.resume_id)
        );
      }

      // Apply minimum score filter (default to 60 if not specified)
      const scoreThreshold = min_score || 60;
      candidatesToSave = candidatesToSave.filter(
        (c) => c.ai_match_score >= scoreThreshold
      );

      if (candidatesToSave.length === 0) {
        return res.status(400).json({
          message: "No candidates meet the criteria",
        });
      }

      // Create applications - map to CreateApplicationDTO
      const applications: CreateApplicationDTO[] = candidatesToSave.map(
        (candidate) => ({
          job_description_id: jobId,
          resume_id: candidate.resume_id,
          applicant_user_id: candidate.user_id,
          ai_match_score: candidate.ai_match_score,
          screening_analysis: candidate.full_analysis || {
            overall_match_score: candidate.ai_match_score,
            skills_match: 0,
            experience_match: 0,
            education_match: 0,
            matched_skills: candidate.preview_analysis.matched_skills,
            missing_skills: candidate.preview_analysis.missing_skills,
            strengths: candidate.preview_analysis.strengths,
            concerns: candidate.preview_analysis.concerns,
            recommendation: candidate.recommendation as any,
            detailed_analysis: "",
          },
        })
      );

      const createdApplications =
        await this.applicationService.createApplicationsBatch(applications);

      // Delete screening cache after successful creation
      await this.cacheService.deleteScreeningResults(screening_id);

      res.status(201).json({
        success: true,
        created: createdApplications.length,
        applications: createdApplications,
      });
    } catch (error: any) {
      console.error("Error creating applications:", error);
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create applications" });
    }
  };
}
