import express from "express";
import { downloadResume } from "../controllers/ResumeDownloadController";
import {
  createResume,
  deleteResume,
  deleteUserProfile,
  getPrimaryResume,
  getResumeById,
  getUserPreferences,
  getUserProfile,
  getUserResumes,
  healthCheck,
  setPrimaryResume,
  updateResume,
  updateUserPreferences,
  updateUserProfile,
} from "../controllers/UserProfileController";
import { authenticate } from "../middleware/auth";
import resumeUploadRoutes from "./resumeUpload.route";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ==================== User Profile Routes ====================
router.get("/profile", getUserProfile);
router.put("/profile", updateUserProfile);
router.delete("/profile", deleteUserProfile);
router.get("/health", healthCheck);

// ==================== User Preferences Routes ====================
router.get("/preferences", getUserPreferences);
router.put("/preferences", updateUserPreferences);

// ==================== Resume Routes ====================
// File upload route (must be before other resume routes to avoid conflicts)
router.use("/resumes", resumeUploadRoutes);

// Resume CRUD routes
router.post("/resumes", createResume);
router.get("/resumes", getUserResumes);
router.get("/resumes/primary", getPrimaryResume);
router.get("/resumes/:id", getResumeById);
router.get("/resumes/:id/download", downloadResume);
router.put("/resumes/:id", updateResume);
router.delete("/resumes/:id", deleteResume);
router.put("/resumes/:id/set-primary", setPrimaryResume);

export default router;
