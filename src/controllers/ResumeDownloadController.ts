import { Request, Response } from "express";
import redisClient from "../config/redis";
import pool from "../db/pool";
import { ResumeService } from "../services/ResumeService";

// Initialize service
const resumeService = new ResumeService(pool, redisClient);

/**
 * Download resume PDF file
 * GET /api/user/resumes/:id/download
 */
export const downloadResume = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const resumeId = parseInt(req.params.id);
    const resume = await resumeService.getResumeById(
      resumeId,
      req.userProfile.id
    );

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    // Check if PDF is stored in database
    if (resume.file_data) {
      // Serve from database
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${resume.file_name || "resume.pdf"}"`
      );
      res.setHeader("Content-Length", resume.file_data.length);
      res.send(resume.file_data);
    } else if (resume.file_path) {
      // Serve from filesystem
      res.download(resume.file_path, resume.file_name || "resume.pdf");
    } else {
      return res.status(404).json({ message: "Resume file not found" });
    }
  } catch (error) {
    console.error("Error downloading resume:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
