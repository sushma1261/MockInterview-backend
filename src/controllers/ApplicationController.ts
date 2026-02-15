import { Request, Response } from "express";
import { ApplicationService } from "../services/ApplicationService";
import {
  ForbiddenError,
  HRStatus,
  NotFoundError,
  ScreeningStatus,
  UpdateApplicationDTO,
  ValidationError,
} from "../types/recruitment";

/**
 * Application Controller
 * Handles resume applications and candidate management
 */
export class ApplicationController {
  private applicationService: ApplicationService;

  constructor() {
    this.applicationService = new ApplicationService();
  }

  /**
   * GET /api/recruitment/jobs/:jobId/applications
   * Get all applications for a job
   */
  getJobApplications = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = parseInt(req.params.jobId);
      const filters = {
        screening_status: req.query.screening_status as ScreeningStatus,
        hr_status: req.query.hr_status as HRStatus,
        min_score: req.query.min_score
          ? parseInt(req.query.min_score as string)
          : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await this.applicationService.getApplicationsByJob(
        jobId,
        filters
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("Error getting job applications:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to get applications" });
    }
  };

  /**
   * GET /api/recruitment/applications/:id
   * Get a single application with full details
   */
  getApplication = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const applicationId = parseInt(req.params.id);
      const application =
        await this.applicationService.getApplicationWithDetails(applicationId);

      res.json({
        success: true,
        application,
      });
    } catch (error: any) {
      console.error("Error getting application:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to get application" });
    }
  };

  /**
   * PUT /api/recruitment/applications/:id
   * Update application status or notes
   */
  updateApplication = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const applicationId = parseInt(req.params.id);
      const updateData: UpdateApplicationDTO = {
        screening_status: req.body.screening_status,
        hr_status: req.body.hr_status,
        hr_notes: req.body.hr_notes,
      };

      const application = await this.applicationService.updateApplication(
        applicationId,
        req.userProfile.id,
        updateData
      );

      res.json({
        success: true,
        application,
      });
    } catch (error: any) {
      console.error("Error updating application:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof ForbiddenError) {
        return res.status(403).json({ message: error.message });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update application" });
    }
  };

  /**
   * POST /api/recruitment/applications/:id/shortlist
   * Shortlist a candidate
   */
  shortlistCandidate = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const applicationId = parseInt(req.params.id);

      const application = await this.applicationService.shortlistCandidate(
        applicationId,
        req.userProfile.id
      );

      res.json({
        success: true,
        message: "Candidate shortlisted successfully",
        application,
      });
    } catch (error: any) {
      console.error("Error shortlisting candidate:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to shortlist candidate" });
    }
  };

  /**
   * POST /api/recruitment/applications/:id/reject
   * Reject a candidate
   */
  rejectCandidate = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const applicationId = parseInt(req.params.id);
      const reason = req.body.reason;

      const application = await this.applicationService.rejectCandidate(
        applicationId,
        req.userProfile.id,
        reason
      );

      res.json({
        success: true,
        message: "Candidate rejected",
        application,
      });
    } catch (error: any) {
      console.error("Error rejecting candidate:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to reject candidate" });
    }
  };

  /**
   * POST /api/recruitment/applications/:id/approve
   * Approve a candidate (move to approved status)
   */
  approveCandidate = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const applicationId = parseInt(req.params.id);
      const notes = req.body.notes;

      const application = await this.applicationService.updateApplication(
        applicationId,
        req.userProfile.id,
        {
          hr_status: HRStatus.APPROVED,
          hr_notes: notes,
        }
      );

      res.json({
        success: true,
        message: "Candidate approved",
        application,
      });
    } catch (error: any) {
      console.error("Error approving candidate:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to approve candidate" });
    }
  };

  /**
   * GET /api/recruitment/applications
   * Get all applications (for admin/HR dashboard)
   */
  getAllApplications = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const filters = {
        screening_status: req.query.screening_status as ScreeningStatus,
        hr_status: req.query.hr_status as HRStatus,
        min_score: req.query.min_score
          ? parseInt(req.query.min_score as string)
          : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      // Get applications across all jobs (HR can filter by their jobs in the query)
      const jobId = req.query.job_id
        ? parseInt(req.query.job_id as string)
        : undefined;

      const result = jobId
        ? await this.applicationService.getApplicationsByJob(jobId, filters)
        : await this.applicationService.getApplicationsByJob(0, filters); // 0 means all jobs

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("Error getting all applications:", error);
      res.status(500).json({ message: "Failed to get applications" });
    }
  };

  /**
   * GET /api/recruitment/applications/bulk-export
   * Export applications as CSV or JSON
   */
  exportApplications = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = req.query.job_id
        ? parseInt(req.query.job_id as string)
        : undefined;
      const format = (req.query.format as string) || "json";

      if (!jobId) {
        return res.status(400).json({ message: "job_id is required" });
      }

      const result = await this.applicationService.getApplicationsByJob(jobId, {
        limit: 1000,
      });

      if (format === "csv") {
        // Convert to CSV
        const csvHeader =
          "ID,Candidate,Email,Resume,Score,Screening Status,HR Status,Created\n";
        const csvRows = result.applications
          .map(
            (app) =>
              `${app.id},"${app.candidate.display_name || ""}","${
                app.candidate.email || ""
              }","${app.resume.title}",${app.ai_match_score},"${
                app.screening_status
              }","${app.hr_status}","${app.screening_date}"`
          )
          .join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="applications-job-${jobId}.csv"`
        );
        res.send(csvHeader + csvRows);
      } else {
        // JSON format
        res.json({
          success: true,
          ...result,
        });
      }
    } catch (error: any) {
      console.error("Error exporting applications:", error);
      res.status(500).json({ message: "Failed to export applications" });
    }
  };
}
