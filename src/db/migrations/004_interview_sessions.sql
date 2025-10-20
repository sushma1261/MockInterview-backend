-- ============================================================================
-- INTERVIEW SESSIONS AND CHAT HISTORY SCHEMA
-- ============================================================================
-- This migration creates tables to track interview sessions and chat history
-- Allows mapping sessions to resumes and job descriptions with full chat logs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: Job Descriptions Table
-- ----------------------------------------------------------------------------

-- Job Descriptions Table
-- Stores job descriptions that users practice with
-- Can be reused across multiple interviews and resumes
CREATE TABLE IF NOT EXISTS job_descriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    description TEXT NOT NULL,
    requirements TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_job_descriptions_user_id ON job_descriptions(user_id);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_job_descriptions_updated_at ON job_descriptions;
CREATE TRIGGER update_job_descriptions_updated_at BEFORE UPDATE ON job_descriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- PART 2: Interview Sessions Table
-- ----------------------------------------------------------------------------

-- Interview Sessions Table
-- Tracks each interview practice session
-- Maps resume + job description + conversation history
CREATE TABLE IF NOT EXISTS interview_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id) ON DELETE CASCADE,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
    job_description_id INTEGER REFERENCES job_descriptions(id) ON DELETE SET NULL,
    
    -- Session metadata
    session_status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed, abandoned
    total_questions INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_minutes INTEGER, -- Calculated when completed
    
    -- Overall feedback (stored when session completes)
    overall_feedback JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_resume_id ON interview_sessions(resume_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_job_description_id ON interview_sessions(job_description_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON interview_sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_started_at ON interview_sessions(started_at DESC);

-- Composite index for user's session history
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_resume ON interview_sessions(user_id, resume_id, started_at DESC);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_interview_sessions_updated_at ON interview_sessions;
CREATE TRIGGER update_interview_sessions_updated_at BEFORE UPDATE ON interview_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- PART 3: Chat Messages Table
-- ----------------------------------------------------------------------------

-- Chat Messages Table
-- Stores individual messages in the conversation
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
    
    -- Message details
    role VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    
    -- Message metadata
    message_type VARCHAR(50), -- 'question', 'answer', 'feedback', 'function_call'
    question_number INTEGER,
    question_type VARCHAR(50), -- 'behavioral', 'technical', 'situational'
    
    -- Function call data (if applicable)
    function_name VARCHAR(100),
    function_result JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Composite index for fetching conversation in order
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_order ON chat_messages(session_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- PART 4: Question Feedback Table
-- ----------------------------------------------------------------------------

-- Question Feedback Table
-- Stores detailed feedback for each question answered
CREATE TABLE IF NOT EXISTS question_feedback (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
    
    -- Question details
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50),
    
    -- User's answer
    user_answer TEXT NOT NULL,
    
    -- AI Feedback
    feedback_text TEXT,
    strengths TEXT[],
    areas_for_improvement TEXT[],
    score INTEGER CHECK (score >= 0 AND score <= 10),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_question_feedback_session_id ON question_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_question_feedback_session_question ON question_feedback(session_id, question_number);

-- ----------------------------------------------------------------------------
-- PART 5: Helper Functions
-- ----------------------------------------------------------------------------

-- Function to automatically update session duration when completed
CREATE OR REPLACE FUNCTION update_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.session_status = 'completed' AND OLD.session_status != 'completed' THEN
        NEW.completed_at := CURRENT_TIMESTAMP;
        NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 60;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update duration when session is marked completed
DROP TRIGGER IF EXISTS trigger_update_session_duration ON interview_sessions;
CREATE TRIGGER trigger_update_session_duration
    BEFORE UPDATE ON interview_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_duration();

-- ----------------------------------------------------------------------------
-- PART 6: Useful Views
-- ----------------------------------------------------------------------------

-- View to get session summary with related data
CREATE OR REPLACE VIEW interview_session_summary AS
SELECT 
    s.id AS session_id,
    s.user_id,
    up.email,
    up.display_name,
    r.title AS resume_title,
    r.file_name AS resume_file_name,
    jd.title AS job_title,
    jd.company_name,
    s.session_status,
    s.total_questions,
    s.questions_answered,
    s.started_at,
    s.completed_at,
    s.duration_minutes,
    COUNT(cm.id) AS total_messages,
    COUNT(qf.id) AS total_feedback_items,
    AVG(qf.score) AS average_score
FROM interview_sessions s
JOIN user_profiles up ON s.user_id = up.id
JOIN resumes r ON s.resume_id = r.id
LEFT JOIN job_descriptions jd ON s.job_description_id = jd.id
LEFT JOIN chat_messages cm ON s.id = cm.session_id
LEFT JOIN question_feedback qf ON s.id = qf.session_id
GROUP BY s.id, up.email, up.display_name, r.title, r.file_name, jd.title, jd.company_name;

-- ----------------------------------------------------------------------------
-- PART 7: Comments and Documentation
-- ----------------------------------------------------------------------------

COMMENT ON TABLE job_descriptions IS 'Stores job descriptions that users practice interviews for';
COMMENT ON TABLE interview_sessions IS 'Tracks each interview practice session with resume and job description mapping';
COMMENT ON TABLE chat_messages IS 'Stores the complete conversation history for each interview session';
COMMENT ON TABLE question_feedback IS 'Stores detailed feedback for each question answered during interviews';

COMMENT ON COLUMN interview_sessions.session_status IS 'Current status: in_progress, completed, or abandoned';
COMMENT ON COLUMN interview_sessions.overall_feedback IS 'JSONB containing final feedback summary when interview completes';
COMMENT ON COLUMN chat_messages.role IS 'Message sender: user or assistant (AI)';
COMMENT ON COLUMN chat_messages.message_type IS 'Type of message: question, answer, feedback, or function_call';
COMMENT ON COLUMN question_feedback.score IS 'Score from 0-10 for the answer quality';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
