-- ============================================================================
-- COMPLETE DATABASE SCHEMA FOR MOCK INTERVIEW APPLICATION
-- ============================================================================
-- This migration creates all necessary tables, indexes, and triggers
-- for the Mock Interview application with vector embeddings support
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: User Profiles and Preferences
-- ----------------------------------------------------------------------------

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id) ON DELETE CASCADE,
    interview_difficulty VARCHAR(50) DEFAULT 'medium', -- easy, medium, hard
    interview_duration INTEGER DEFAULT 30, -- in minutes
    preferred_languages TEXT[], -- array of programming languages
    theme VARCHAR(20) DEFAULT 'light', -- light, dark
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Resumes Table
CREATE TABLE IF NOT EXISTS resumes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT,
    file_size INTEGER, -- in bytes
    content TEXT, -- extracted text content
    file_data BYTEA, -- binary data of the PDF file (optional)
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, file_name) -- Ensure unique filename per user
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_firebase_uid ON user_profiles(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to update updated_at automatically
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resumes_updated_at ON resumes;
CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON resumes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON COLUMN resumes.file_data IS 'Binary data of the PDF file (optional, can use file_path instead)';

-- ----------------------------------------------------------------------------
-- PART 2: Vector Embeddings for Resume Chunks
-- ----------------------------------------------------------------------------

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Resume Chunks Table for Vector Embeddings
-- This table stores text chunks from resumes with their vector embeddings
-- Used for AI-powered semantic search and interview question generation
CREATE TABLE IF NOT EXISTS resume_chunks (
    id SERIAL PRIMARY KEY,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
    chunk_index INTEGER,                   -- Order of chunk within the resume (0, 1, 2, ...)
    text TEXT NOT NULL,                    -- The actual text chunk from the resume
    metadata JSONB,                         -- Stores user_id, resume_id, chunk_index and other metadata
    embedding vector(768),                  -- Vector embedding (768 dimensions for gemini-embedding-001)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_resume_chunks_resume_id ON resume_chunks(resume_id);

-- Index for vector similarity search (using HNSW algorithm)
-- This significantly speeds up similarity searches
CREATE INDEX IF NOT EXISTS idx_resume_chunks_embedding ON resume_chunks 
USING hnsw (embedding vector_cosine_ops);

-- Index on metadata for additional filtering
CREATE INDEX IF NOT EXISTS idx_resume_chunks_metadata ON resume_chunks USING gin(metadata);

-- Index for filtering by user_id in metadata
CREATE INDEX IF NOT EXISTS idx_resume_chunks_user_id ON resume_chunks 
((metadata->>'user_id'));

-- Unique index to prevent duplicate chunks (conditional on non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_chunks_unique ON resume_chunks(resume_id, chunk_index)
WHERE resume_id IS NOT NULL AND chunk_index IS NOT NULL;

-- ----------------------------------------------------------------------------
-- PART 3: Trigger to Auto-populate resume_id and chunk_index from metadata
-- ----------------------------------------------------------------------------

-- Create a trigger function to auto-populate resume_id and chunk_index from metadata
-- This allows PGVectorStore to work seamlessly while maintaining referential integrity
CREATE OR REPLACE FUNCTION populate_resume_chunk_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract resume_id from metadata if it exists
  IF NEW.metadata ? 'resume_id' THEN
    NEW.resume_id := (NEW.metadata->>'resume_id')::INTEGER;
  END IF;
  
  -- Extract chunk_index from metadata if it exists
  IF NEW.metadata ? 'chunk_index' THEN
    NEW.chunk_index := (NEW.metadata->>'chunk_index')::INTEGER;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run before insert
DROP TRIGGER IF EXISTS trigger_populate_resume_chunk_fields ON resume_chunks;
CREATE TRIGGER trigger_populate_resume_chunk_fields
  BEFORE INSERT ON resume_chunks
  FOR EACH ROW
  EXECUTE FUNCTION populate_resume_chunk_fields();

-- ----------------------------------------------------------------------------
-- PART 4: Comments and Documentation
-- ----------------------------------------------------------------------------

COMMENT ON TABLE user_profiles IS 'Stores user profile information from Firebase Authentication';
COMMENT ON TABLE user_preferences IS 'Stores user preferences for interview settings';
COMMENT ON TABLE resumes IS 'Stores resume files and extracted content for users. Each user can have multiple resumes with unique filenames.';
COMMENT ON TABLE resume_chunks IS 'Stores resume text chunks with vector embeddings for AI-powered semantic search. Each chunk is linked to a resume via resume_id.';

COMMENT ON COLUMN resumes.file_name IS 'Original filename of the resume - must be unique per user';
COMMENT ON COLUMN resume_chunks.resume_id IS 'Foreign key to resumes table - auto-populated from metadata JSONB via trigger';
COMMENT ON COLUMN resume_chunks.chunk_index IS 'Sequential index of chunk - auto-populated from metadata JSONB via trigger';
COMMENT ON COLUMN resume_chunks.text IS 'Text chunk extracted from resume (typically 500 chars with 100 char overlap)';
COMMENT ON COLUMN resume_chunks.metadata IS 'JSONB containing user_id, resume_id, chunk_index and other metadata for flexible querying';
COMMENT ON COLUMN resume_chunks.embedding IS 'Vector embedding generated by Google gemini-embedding-001 model (768 dimensions)';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
