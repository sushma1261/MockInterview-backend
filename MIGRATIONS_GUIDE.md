# Database Migrations Guide

## Overview

This project uses sequential SQL migration files to manage database schema changes. All migrations are located in `src/db/migrations/` and are executed in numerical order.

---

## Migration Files

### 001_user_profiles.sql
**Purpose:** Creates core user profile tables

**Tables Created:**
- `user_profiles` - Firebase user data (uid, email, display_name, photo_url)
- `user_preferences` - User interview preferences (difficulty, duration, languages, theme)
- `resumes` - Resume metadata (title, file_name, file_path, file_size, content)

**Features:**
- Foreign key constraints with CASCADE delete
- Indexes for performance (firebase_uid, user_id)
- Auto-updating `updated_at` triggers

---

### 002_add_pdf_storage.sql
**Purpose:** Adds binary PDF storage capability

**Changes:**
- Adds `file_data BYTEA` column to `resumes` table
- Allows storing PDF files directly in PostgreSQL

**Use Case:**
- Store small PDFs (< 1MB) in database for ACID consistency
- Or keep using file_path for filesystem storage

---

### 003_create_vector_store.sql
**Purpose:** Creates vector embedding storage for AI-powered resume analysis

**Prerequisites:**
- PostgreSQL with `pgvector` extension installed

**Tables Created:**
- `resume_chunks` - Stores resume text chunks with vector embeddings

**Schema:**
```sql
CREATE TABLE resume_chunks (
    id UUID PRIMARY KEY,
    text TEXT,                     -- Resume text chunk
    metadata JSONB,                -- user_id, resume_id, etc.
    embedding vector(768)          -- Google text-embedding-004 (768 dims)
);
```

**Indexes:**
- GIN index on metadata for fast JSON queries
- HNSW index on embedding for fast vector similarity search
- Indexes on metadata->>'user_id' and metadata->>'resume_id'

**Use Case:**
- Semantic search through resume content
- AI-powered interview question generation
- Context retrieval for personalized interviews

---

## Running Migrations

### Option 1: Using npm script

```bash
npm run migrate
```

### Option 2: Using ts-node directly

```bash
npx ts-node src/db/migrate.ts
```

### Option 3: Inside Docker container

```bash
# Run all migrations
docker compose exec backend npm run migrate

# Or run specific migration file
docker compose exec postgres psql -U system -d mockinterview -f /app/src/db/migrations/003_create_vector_store.sql
```

### Option 4: Manually via psql

```bash
# Connect to database
docker compose exec postgres psql -U system -d mockinterview

# Run migrations
\i /app/src/db/migrations/001_user_profiles.sql
\i /app/src/db/migrations/002_add_pdf_storage.sql
\i /app/src/db/migrations/003_create_vector_store.sql
```

---

## Verify Migrations

### Check if pgvector is installed

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

If not installed:
```sql
CREATE EXTENSION vector;
```

### Check tables exist

```sql
\dt

-- Or
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

### Check resume_chunks table structure

```sql
\d resume_chunks

-- Should show:
-- Column    | Type         | Description
-- ----------|--------------|------------------
-- id        | uuid         | Primary key
-- text      | text         | Resume text chunk
-- metadata  | jsonb        | user_id, resume_id
-- embedding | vector(768)  | Vector embedding
```

### Verify indexes

```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'resume_chunks';
```

### Check table sizes

```sql
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Migration Order

Migrations MUST be run in order:
1. `001_user_profiles.sql` - Creates base tables
2. `002_add_pdf_storage.sql` - Alters resumes table
3. `003_create_vector_store.sql` - Creates vector store (requires pgvector)

The migration script (`src/db/migrate.ts`) automatically runs them in alphabetical/numerical order.

---

## Troubleshooting

### Error: "extension vector does not exist"

**Solution:**
```bash
# Install pgvector in Docker container
docker compose exec postgres sh -c "apt-get update && apt-get install -y postgresql-16-pgvector"

# Or use a postgres image with pgvector pre-installed
# Update docker-compose.yaml:
services:
  postgres:
    image: pgvector/pgvector:pg16
```

### Error: "relation resume_chunks already exists"

The migration uses `CREATE TABLE IF NOT EXISTS`, so this shouldn't happen. But if it does:
```sql
-- Check if table exists
SELECT * FROM resume_chunks LIMIT 1;

-- If it exists and you want to recreate it:
DROP TABLE resume_chunks;
-- Then re-run migration
```

### Error: "permission denied to create extension"

**Solution:**
```bash
# Connect as superuser
docker compose exec postgres psql -U postgres -d mockinterview

CREATE EXTENSION IF NOT EXISTS vector;
```

### Check migration status

```sql
-- Check what tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Check if vector extension is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check resume_chunks indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'resume_chunks';
```

---

## Adding New Migrations

### Naming Convention
Use sequential numbering: `00X_description.sql`

Example:
```
004_add_interview_history.sql
005_add_user_settings.sql
```

### Template

```sql
-- Description of what this migration does
-- Date: YYYY-MM-DD

-- Create/alter tables
CREATE TABLE IF NOT EXISTS new_table (
    id SERIAL PRIMARY KEY,
    -- columns here
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_new_table_column 
ON new_table(column_name);

-- Add comments
COMMENT ON TABLE new_table IS 'Description of table purpose';
```

### Best Practices

1. ✅ Use `IF NOT EXISTS` to make migrations idempotent
2. ✅ Add comments explaining the purpose
3. ✅ Include both UP and DOWN migrations (or make reversible)
4. ✅ Test migrations on a copy of production data first
5. ✅ Keep migrations small and focused
6. ✅ Never modify existing migration files (create new ones instead)

---

## Production Deployment

### Pre-deployment Checklist

- [ ] Test migrations on local database
- [ ] Test migrations on staging database
- [ ] Backup production database
- [ ] Review migration SQL for any destructive operations
- [ ] Plan rollback strategy
- [ ] Estimate migration time for large tables

### Running in Production

```bash
# 1. Backup database
docker compose exec postgres pg_dump -U system mockinterview > backup.sql

# 2. Run migrations
docker compose exec backend npm run migrate

# 3. Verify
docker compose exec postgres psql -U system -d mockinterview -c "\dt"

# 4. If something goes wrong, restore
docker compose exec -T postgres psql -U system -d mockinterview < backup.sql
```

---

## Summary

| Migration | Purpose | Dependencies |
|-----------|---------|--------------|
| 001 | User profiles, preferences, resumes | None |
| 002 | Add PDF binary storage | Migration 001 |
| 003 | Vector embeddings for AI | pgvector extension |

All migrations are **idempotent** (safe to run multiple times) and run automatically via `npm run migrate`.
