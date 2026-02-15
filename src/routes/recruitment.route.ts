import { Router } from "express";
import { ApplicationController } from "../controllers/ApplicationController";
import { RecruitmentController } from "../controllers/RecruitmentController";
import { RoleController } from "../controllers/RoleController";
import {
    authenticate,
    requireAdmin,
    requireAnyRole,
    requireHR,
} from "../middleware/auth";
import { screeningLimiter } from "../middleware/rateLimiter";
import { UserRole } from "../types/recruitment";

const router = Router();

// Initialize controllers
const recruitmentController = new RecruitmentController();
const applicationController = new ApplicationController();
const roleController = new RoleController();

// ----------------------------------------------------------------------------
// Role Management Routes (Admin access required except self-registration)
// ----------------------------------------------------------------------------

// Get current user's roles (any authenticated user)
router.get("/roles/my-roles", authenticate, roleController.getMyRoles);

// Check if user has a specific role (any authenticated user)
router.get("/roles/check", authenticate, roleController.checkRole);

// Self-register as candidate (any authenticated user)
router.post(
  "/roles/register-candidate",
  authenticate,
  roleController.registerAsCandidate
);

// Get all users with their roles (admin only)
router.get(
  "/roles/users",
  authenticate,
  requireAdmin,
  roleController.getAllUsers
);

// Search users (admin only)
router.get(
  "/roles/users/search",
  authenticate,
  requireAdmin,
  roleController.searchUsers
);

// Get user roles by ID (admin/HR can see)
router.get(
  "/roles/users/:userId",
  authenticate,
  requireAnyRole(UserRole.ADMIN, UserRole.HR),
  roleController.getUserRoles
);

// Update user role (admin only)
router.put(
  "/roles/users/:userId/role",
  authenticate,
  requireAdmin,
  roleController.updateUserRole
);

// Bulk update user roles (admin only)
router.post(
  "/roles/users/bulk-update",
  authenticate,
  requireAdmin,
  roleController.bulkUpdateUserRoles
);

// Assign role (admin only)
router.post(
  "/roles/assign",
  authenticate,
  requireAdmin,
  roleController.assignRole
);

// Remove role (admin only)
router.delete(
  "/roles/remove",
  authenticate,
  requireAdmin,
  roleController.removeRole
);

// Get all HR users (admin/HR only)
router.get(
  "/roles/hr-users",
  authenticate,
  requireAnyRole(UserRole.ADMIN, UserRole.HR),
  roleController.getHRUsers
);

// Get all candidates (admin/HR only)
router.get(
  "/roles/candidates",
  authenticate,
  requireAnyRole(UserRole.ADMIN, UserRole.HR),
  roleController.getCandidates
);

// Get all admins (admin only)
router.get(
  "/roles/admins",
  authenticate,
  requireAdmin,
  roleController.getAdmins
);

// ----------------------------------------------------------------------------
// Job Description Routes (HR access required)
// ----------------------------------------------------------------------------

// Create new job description (HR only)
router.post("/jobs", authenticate, requireHR, recruitmentController.createJob);

// List all job descriptions (HR can see all, candidates see public)
router.get("/jobs", authenticate, recruitmentController.listJobs);

// Get single job description
router.get("/jobs/:id", authenticate, recruitmentController.getJob);

// Update job description (HR who created it only)
router.put(
  "/jobs/:id",
  authenticate,
  requireHR,
  recruitmentController.updateJob
);

// Delete job description (HR who created it only)
router.delete(
  "/jobs/:id",
  authenticate,
  requireHR,
  recruitmentController.deleteJob
);

// Get job statistics (HR only)
router.get(
  "/jobs/:id/statistics",
  authenticate,
  requireHR,
  recruitmentController.getJobStatistics
);

// ----------------------------------------------------------------------------
// Resume Screening Routes (HR only)
// ----------------------------------------------------------------------------

// Screen resumes for a job (returns preview)
router.post(
  "/jobs/:id/screen",
  screeningLimiter,
  authenticate,
  requireHR,
  recruitmentController.screenResumes
);

// Get cached screening preview
router.get(
  "/screening/:screeningId",
  authenticate,
  requireHR,
  recruitmentController.getScreeningPreview
);

// Create applications from screening results (HR only)
router.post(
  "/jobs/:id/applications/create",
  authenticate,
  requireHR,
  recruitmentController.createApplicationsFromScreening
);

// ----------------------------------------------------------------------------
// Application Management Routes (HR access required)
// ----------------------------------------------------------------------------

// Get all applications for a specific job
router.get(
  "/jobs/:jobId/applications",
  authenticate,
  requireHR,
  applicationController.getJobApplications
);

// Get all applications (across all jobs) - for dashboard
router.get(
  "/applications",
  authenticate,
  requireAnyRole(UserRole.ADMIN, UserRole.HR),
  applicationController.getAllApplications
);

// Get single application with details
router.get(
  "/applications/:id",
  authenticate,
  requireHR,
  applicationController.getApplication
);

// Update application (change status, add notes)
router.put(
  "/applications/:id",
  authenticate,
  requireHR,
  applicationController.updateApplication
);

// Shortlist a candidate
router.post(
  "/applications/:id/shortlist",
  authenticate,
  requireHR,
  applicationController.shortlistCandidate
);

// Reject a candidate
router.post(
  "/applications/:id/reject",
  authenticate,
  requireHR,
  applicationController.rejectCandidate
);

// Approve a candidate
router.post(
  "/applications/:id/approve",
  authenticate,
  requireHR,
  applicationController.approveCandidate
);

// Export applications (CSV/JSON)
router.get(
  "/applications/bulk-export",
  authenticate,
  requireHR,
  applicationController.exportApplications
);

// ----------------------------------------------------------------------------
// Health Check
// ----------------------------------------------------------------------------

router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Recruitment API is running",
    version: "1.0.0",
  });
});

export default router;
