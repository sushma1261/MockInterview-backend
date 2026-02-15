-- ============================================================================
-- HR RECRUITMENT SYSTEM SCHEMA
-- ============================================================================
-- This migration adds HR recruitment features:
-- - User roles (admin, hr, candidate, interviewer)
-- - Enhanced job descriptions
-- - Resume applications (only selected candidates)
-- - Screening configuration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: User Roles Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'hr', 'candidate', 'interviewer', 'hiring_manager')),
    department VARCHAR(100),
    assigned_by INTEGER REFERENCES user_profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role) -- Users can have multiple roles, but not duplicate
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE user_roles IS 'Stores user roles for access control - admin assigns HR roles, candidates upload resumes';
COMMENT ON COLUMN user_roles.role IS 'User role: admin (first user), hr (posts jobs), candidate (uploads resumes), interviewer, hiring_manager';

-- ----------------------------------------------------------------------------
-- PART 2: Enhance Job Descriptions Table
-- ----------------------------------------------------------------------------

-- Add new columns to existing job_descriptions table
ALTER TABLE job_descriptions 
ADD COLUMN IF NOT EXISTS hr_user_id INTEGER REFERENCES user_profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'on_hold')),
ADD COLUMN IF NOT EXISTS required_skills TEXT[],
ADD COLUMN IF NOT EXISTS required_experience_years INTEGER,
ADD COLUMN IF NOT EXISTS positions_available INTEGER DEFAULT 1,

-- Screening configuration per job
ADD COLUMN IF NOT EXISTS screening_config JSONB DEFAULT '{"max_candidates": 10, "similarity_threshold": 0.6, "application_threshold": 60}'::jsonb;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_job_descriptions_hr_user_id ON job_descriptions(hr_user_id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_status ON job_descriptions(status);

COMMENT ON COLUMN job_descriptions.hr_user_id IS 'HR user who created this job posting';
COMMENT ON COLUMN job_descriptions.status IS 'Job status: draft, active, closed, on_hold';
COMMENT ON COLUMN job_descriptions.required_skills IS 'Array of required skills for AI matching';
COMMENT ON COLUMN job_descriptions.required_experience_years IS 'Minimum years of experience required';
COMMENT ON COLUMN job_descriptions.screening_config IS 'Per-job screening settings: max_candidates (top N), similarity_threshold (0-1), application_threshold (score >= N to save)';

-- ----------------------------------------------------------------------------
-- PART 3: Resume Applications Table
-- ----------------------------------------------------------------------------

-- Stores only candidates that HR selected after screening (score >= threshold)
CREATE TABLE IF NOT EXISTS resume_applications (
    id SERIAL PRIMARY KEY,
    job_description_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
    resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    applicant_user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- AI Screening Results
    ai_match_score DECIMAL(5,2), -- 0.00 to 100.00
    screening_status VARCHAR(50) DEFAULT 'screened' CHECK (screening_status IN ('screened', 'shortlisted', 'rejected', 'interviewed', 'hired')),
    screening_analysis JSONB, -- Detailed AI analysis
    screening_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- HR Review
    hr_status VARCHAR(50) DEFAULT 'pending' CHECK (hr_status IN ('pending', 'reviewing', 'approved', 'rejected', 'on_hold')),
    hr_notes TEXT,
    hr_reviewed_by INTEGER REFERENCES user_profiles(id) ON DELETE SET NULL,
    hr_reviewed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(job_description_id, resume_id) -- Prevent duplicate applications
);

CREATE INDEX IF NOT EXISTS idx_resume_applications_job_id ON resume_applications(job_description_id);
CREATE INDEX IF NOT EXISTS idx_resume_applications_resume_id ON resume_applications(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_applications_applicant_id ON resume_applications(applicant_user_id);
CREATE INDEX IF NOT EXISTS idx_resume_applications_screening_status ON resume_applications(screening_status);
CREATE INDEX IF NOT EXISTS idx_resume_applications_hr_status ON resume_applications(hr_status);
CREATE INDEX IF NOT EXISTS idx_resume_applications_match_score ON resume_applications(ai_match_score DESC);

-- Composite index for HR viewing candidates for a job
CREATE INDEX IF NOT EXISTS idx_resume_applications_job_score ON resume_applications(job_description_id, ai_match_score DESC);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_resume_applications_updated_at ON resume_applications;
CREATE TRIGGER update_resume_applications_updated_at BEFORE UPDATE ON resume_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE resume_applications IS 'Stores only selected candidates (score >= threshold) after HR reviews screening results';
COMMENT ON COLUMN resume_applications.ai_match_score IS 'AI-calculated match score (0-100) from screening';
COMMENT ON COLUMN resume_applications.screening_status IS 'Candidate status in hiring pipeline: screened, shortlisted, rejected, interviewed, hired';
COMMENT ON COLUMN resume_applications.hr_status IS 'HR review status: pending, reviewing, approved, rejected, on_hold';
COMMENT ON COLUMN resume_applications.screening_analysis IS 'JSONB containing detailed AI analysis: matched_skills, missing_skills, strengths, concerns, recommendation';

-- ----------------------------------------------------------------------------
-- PART 4: Enforce Role-Based Resume Upload
-- ----------------------------------------------------------------------------

-- Add constraint: Only candidates can upload resumes
-- This will be enforced at application level, but add a check function for reference

CREATE OR REPLACE FUNCTION check_candidate_role_for_resume()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if user has 'candidate' role
    IF NOT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = NEW.user_id 
        AND role = 'candidate'
    ) THEN
        RAISE EXCEPTION 'Only users with candidate role can upload resumes';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Optional: Uncomment to enforce at database level
-- DROP TRIGGER IF EXISTS enforce_candidate_resume_upload ON resumes;
-- CREATE TRIGGER enforce_candidate_resume_upload
--     BEFORE INSERT OR UPDATE ON resumes
--     FOR EACH ROW
--     EXECUTE FUNCTION check_candidate_role_for_resume();

COMMENT ON FUNCTION check_candidate_role_for_resume IS 'Ensures only users with candidate role can upload resumes (can be enabled as trigger)';

-- ----------------------------------------------------------------------------
-- PART 5: Screening Cache Table (Optional - can use Redis instead)
-- ----------------------------------------------------------------------------

-- Optional: Store screening previews in database instead of Redis
-- Uncomment if you prefer database over Redis

/*
CREATE TABLE IF NOT EXISTS screening_previews (
    id VARCHAR(100) PRIMARY KEY, -- screening_id like 'temp-abc123'
    job_description_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
    hr_user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    screening_results JSONB NOT NULL, -- Full screening results
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_screening_previews_job_id ON screening_previews(job_description_id);
CREATE INDEX IF NOT EXISTS idx_screening_previews_expires_at ON screening_previews(expires_at);

COMMENT ON TABLE screening_previews IS 'Temporary storage for screening preview results (alternative to Redis)';
*/

-- ----------------------------------------------------------------------------
-- PART 6: Helper Views
-- ----------------------------------------------------------------------------

-- View: Get all candidates (users with candidate role)
CREATE OR REPLACE VIEW candidate_users AS
SELECT 
    up.id,
    up.firebase_uid,
    up.email,
    up.display_name,
    up.photo_url,
    ur.department,
    COUNT(r.id) as resume_count,
    up.created_at
FROM user_profiles up
JOIN user_roles ur ON up.id = ur.user_id
LEFT JOIN resumes r ON up.id = r.user_id
WHERE ur.role = 'candidate'
GROUP BY up.id, up.firebase_uid, up.email, up.display_name, up.photo_url, ur.department, up.created_at;

COMMENT ON VIEW candidate_users IS 'All users with candidate role and their resume count';

-- View: Get all HR users
CREATE OR REPLACE VIEW hr_users AS
SELECT 
    up.id,
    up.firebase_uid,
    up.email,
    up.display_name,
    up.photo_url,
    ur.department,
    ur.assigned_by,
    ur.assigned_at,
    COUNT(DISTINCT jd.id) as jobs_posted
FROM user_profiles up
JOIN user_roles ur ON up.id = ur.user_id
LEFT JOIN job_descriptions jd ON up.id = jd.hr_user_id
WHERE ur.role = 'hr'
GROUP BY up.id, up.firebase_uid, up.email, up.display_name, up.photo_url, ur.department, ur.assigned_by, ur.assigned_at;

COMMENT ON VIEW hr_users IS 'All users with HR role and their job posting count';

-- View: Job applications summary
CREATE OR REPLACE VIEW job_applications_summary AS
SELECT 
    jd.id as job_id,
    jd.title as job_title,
    jd.status as job_status,
    jd.hr_user_id,
    up.display_name as hr_name,
    COUNT(ra.id) as total_applications,
    COUNT(CASE WHEN ra.hr_status = 'pending' THEN 1 END) as pending_review,
    COUNT(CASE WHEN ra.screening_status = 'shortlisted' THEN 1 END) as shortlisted,
    COUNT(CASE WHEN ra.screening_status = 'interviewed' THEN 1 END) as interviewed,
    COUNT(CASE WHEN ra.screening_status = 'hired' THEN 1 END) as hired,
    AVG(ra.ai_match_score) as average_score,
    MAX(ra.ai_match_score) as top_score,
    jd.created_at,
    jd.updated_at
FROM job_descriptions jd
LEFT JOIN resume_applications ra ON jd.id = ra.job_description_id
LEFT JOIN user_profiles up ON jd.hr_user_id = up.id
GROUP BY jd.id, jd.title, jd.status, jd.hr_user_id, up.display_name, jd.created_at, jd.updated_at;

COMMENT ON VIEW job_applications_summary IS 'Summary of applications per job with statistics';

-- ----------------------------------------------------------------------------
-- PART 7: Default Data (First User Setup)
-- ----------------------------------------------------------------------------

-- Function to assign admin role to first user
CREATE OR REPLACE FUNCTION assign_first_user_as_admin()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if this is the first user
    IF (SELECT COUNT(*) FROM user_profiles) = 1 THEN
        -- Assign admin role to first user
        INSERT INTO user_roles (user_id, role, assigned_by, assigned_at)
        VALUES (NEW.id, 'admin', NEW.id, CURRENT_TIMESTAMP);
        
        RAISE NOTICE 'First user % has been assigned admin role', NEW.email;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign admin role to first user
DROP TRIGGER IF EXISTS assign_first_user_admin_role ON user_profiles;
CREATE TRIGGER assign_first_user_admin_role
    AFTER INSERT ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION assign_first_user_as_admin();

COMMENT ON FUNCTION assign_first_user_as_admin IS 'Automatically assigns admin role to the first user created';

-- ----------------------------------------------------------------------------
-- PART 8: Security and Permissions
-- ----------------------------------------------------------------------------

-- Function to check if user has specific role
CREATE OR REPLACE FUNCTION has_role(check_user_id INTEGER, check_role VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = check_user_id 
        AND role = check_role
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION has_role IS 'Check if a user has a specific role - Usage: SELECT has_role(123, ''hr'')';

-- Function to get user roles
CREATE OR REPLACE FUNCTION get_user_roles(check_user_id INTEGER)
RETURNS TEXT[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT role FROM user_roles 
        WHERE user_id = check_user_id
        ORDER BY role
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_roles IS 'Get all roles for a user - Usage: SELECT get_user_roles(123)';

-- ----------------------------------------------------------------------------
-- PART 9: Sample Data (for testing - comment out for production)
-- ----------------------------------------------------------------------------

-- Uncomment to add sample roles for testing
/*
-- Assuming user IDs 1, 2, 3 exist
INSERT INTO user_roles (user_id, role, assigned_by) VALUES
(1, 'admin', 1),
(1, 'hr', 1), -- Admin can also be HR
(2, 'hr', 1),
(3, 'candidate', 1),
(4, 'candidate', 1)
ON CONFLICT (user_id, role) DO NOTHING;
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Verification queries (run after migration)
/*
-- Check roles table
SELECT * FROM user_roles ORDER BY user_id, role;

-- Check first user admin assignment
SELECT 
    up.id,
    up.email,
    array_agg(ur.role) as roles
FROM user_profiles up
LEFT JOIN user_roles ur ON up.id = ur.user_id
GROUP BY up.id, up.email
ORDER BY up.id
LIMIT 5;

-- Check job descriptions schema
\d job_descriptions

-- Check resume applications table
\d resume_applications

-- Check views
SELECT * FROM candidate_users LIMIT 5;
SELECT * FROM hr_users LIMIT 5;
SELECT * FROM job_applications_summary LIMIT 5;

-- Test role functions
SELECT has_role(1, 'admin');
SELECT get_user_roles(1);
*/
