// ============================================================================
// RECRUITMENT SYSTEM TYPE DEFINITIONS
// ============================================================================

// ----------------------------------------------------------------------------
// User Roles
// ----------------------------------------------------------------------------

export enum UserRole {
  ADMIN = "admin",
  HR = "hr",
  CANDIDATE = "candidate",
  INTERVIEWER = "interviewer",
  HIRING_MANAGER = "hiring_manager",
}

export interface UserRoleRecord {
  id: number;
  user_id: number;
  role: UserRole;
  department?: string;
  assigned_by?: number;
  assigned_at: Date;
  created_at: Date;
  updated_at: Date;
}

// ----------------------------------------------------------------------------
// Job Descriptions
// ----------------------------------------------------------------------------

export enum JobStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  CLOSED = "closed",
  ON_HOLD = "on_hold",
}

export interface ScreeningConfig {
  max_candidates: number; // Top N resumes to screen (default: 10)
  similarity_threshold: number; // Min vector similarity 0-1 (default: 0.6)
  application_threshold: number; // Min AI score to save (default: 60)
}

export interface JobDescription {
  id: number;
  user_id: number; // Original creator
  hr_user_id?: number; // HR who posted it
  title: string;
  company_name?: string;
  description: string;
  requirements?: string;
  required_skills?: string[];
  required_experience_years?: number;
  positions_available: number;
  status: JobStatus;
  screening_config: ScreeningConfig;
  created_at: Date;
  updated_at: Date;
}

export interface CreateJobDescriptionDTO {
  title: string;
  description: string;
  company_name?: string;
  requirements?: string;
  required_skills?: string[];
  required_experience_years?: number;
  positions_available?: number;
  screening_config?: Partial<ScreeningConfig>;
}

export interface UpdateJobDescriptionDTO
  extends Partial<CreateJobDescriptionDTO> {
  status?: JobStatus;
}

// ----------------------------------------------------------------------------
// Resume Applications
// ----------------------------------------------------------------------------

export enum ScreeningStatus {
  SCREENED = "screened",
  SHORTLISTED = "shortlisted",
  REJECTED = "rejected",
  INTERVIEWED = "interviewed",
  HIRED = "hired",
}

export enum HRStatus {
  PENDING = "pending",
  REVIEWING = "reviewing",
  APPROVED = "approved",
  REJECTED = "rejected",
  ON_HOLD = "on_hold",
}

export interface ResumeScreeningResult {
  overall_match_score: number; // 0-100
  skills_match: number; // 0-100
  experience_match: number; // 0-100
  education_match: number; // 0-100
  matched_skills: string[];
  missing_skills: string[];
  strengths: string[];
  concerns: string[];
  recommendation:
    | "strong_match"
    | "good_match"
    | "moderate_match"
    | "weak_match"
    | "no_match";
  detailed_analysis: string;
}

export interface ResumeApplication {
  id: number;
  job_description_id: number;
  resume_id: number;
  applicant_user_id: number;
  ai_match_score: number;
  screening_status: ScreeningStatus;
  screening_analysis: ResumeScreeningResult;
  screening_date: Date;
  hr_status: HRStatus;
  hr_notes?: string;
  hr_reviewed_by?: number;
  hr_reviewed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateApplicationDTO {
  job_description_id: number;
  resume_id: number;
  applicant_user_id: number;
  ai_match_score: number;
  screening_analysis: ResumeScreeningResult;
}

export interface UpdateApplicationDTO {
  screening_status?: ScreeningStatus;
  hr_status?: HRStatus;
  hr_notes?: string;
}

// ----------------------------------------------------------------------------
// Screening Preview (Temporary Results)
// ----------------------------------------------------------------------------

export interface CandidatePreview {
  resume_id: number;
  user_id: number;
  candidate_name?: string;
  candidate_email?: string;
  resume_title: string;
  ai_match_score: number;
  recommendation: string;
  preview_analysis: {
    matched_skills: string[];
    missing_skills: string[];
    strengths: string[];
    concerns: string[];
  };
  full_analysis?: ResumeScreeningResult; // Store complete AI analysis for later use
}

export interface ScreeningPreviewResult {
  screening_id: string; // Temporary ID (e.g., 'temp-abc123')
  job_description_id: number;
  status: "completed" | "processing" | "failed";
  total_resumes_found: number;
  candidates_screened: number;
  summary: {
    strong_match: number; // Count of 80-100 scores
    good_match: number; // Count of 60-79 scores
    moderate_match: number; // Count of 40-59 scores
    weak_match: number; // Count of 0-39 scores
  };
  score_distribution: {
    [range: string]: number; // e.g., "90-100": 2
  };
  candidates: CandidatePreview[];
  suggested_actions: {
    recommended_threshold: number;
    recommended_count: number;
    message: string;
  };
  expires_at: Date;
  created_at: Date;
}

export interface CreateApplicationsFromScreeningDTO {
  screening_id: string;
  selection_criteria: {
    min_score?: number;
    selected_resume_ids?: number[];
    excluded_resume_ids?: number[];
  };
}

// ----------------------------------------------------------------------------
// API Request/Response Types
// ----------------------------------------------------------------------------

export interface ScreenResumeRequest {
  max_candidates?: number; // Default: 10
  similarity_threshold?: number; // Default: 0.6
  mode?: "preview" | "auto"; // Default: preview
}

export interface ScreenResumeResponse {
  success: boolean;
  screening_id?: string;
  data?: ScreeningPreviewResult;
  message?: string;
}

export interface GetApplicationsRequest {
  job_id: number;
  min_score?: number;
  screening_status?: ScreeningStatus;
  hr_status?: HRStatus;
  limit?: number;
  offset?: number;
}

export interface ApplicationWithDetails extends ResumeApplication {
  candidate: {
    user_id: number;
    email: string;
    display_name?: string;
    photo_url?: string;
  };
  resume: {
    id: number;
    title: string;
    file_name?: string;
  };
  job: {
    id: number;
    title: string;
    company_name?: string;
  };
}

// ----------------------------------------------------------------------------
// Statistics and Analytics
// ----------------------------------------------------------------------------

export interface JobStatistics {
  job_id: number;
  job_title: string;
  job_status: JobStatus;
  total_applications: number;
  pending_review: number;
  shortlisted: number;
  interviewed: number;
  hired: number;
  rejected: number;
  average_score: number;
  top_score: number;
  created_at: Date;
  updated_at: Date;
}

export interface HRDashboardStats {
  total_jobs: number;
  active_jobs: number;
  total_applications: number;
  pending_review: number;
  recent_jobs: JobStatistics[];
  top_candidates: Array<{
    application_id: number;
    candidate_name: string;
    job_title: string;
    ai_match_score: number;
    applied_date: Date;
  }>;
}

// ----------------------------------------------------------------------------
// Role Management
// ----------------------------------------------------------------------------

export interface AssignRoleDTO {
  user_id: number;
  role: UserRole;
  department?: string;
  assigned_by: number;
}

export interface RemoveRoleDTO {
  user_id: number;
  role: UserRole;
}

export interface UserWithRoles {
  id: number;
  firebase_uid: string;
  email: string;
  display_name?: string;
  photo_url?: string;
  roles: UserRole[];
  departments?: string[];
  created_at: Date;
}

// ----------------------------------------------------------------------------
// Error Types
// ----------------------------------------------------------------------------

export class RecruitmentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "RecruitmentError";
  }
}

export class UnauthorizedError extends RecruitmentError {
  constructor(message: string = "Unauthorized access") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends RecruitmentError {
  constructor(message: string = "Insufficient permissions") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends RecruitmentError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends RecruitmentError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}
