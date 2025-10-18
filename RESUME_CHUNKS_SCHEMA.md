# Resume Chunks Database Schema

## Overview

The `resume_chunks` table stores text chunks from resumes with vector embeddings for AI-powered semantic search. Each chunk is directly linked to a resume via `resume_id` with automatic cascade deletion.

---

## Table Structure

```sql
CREATE TABLE resume_chunks (
    id SERIAL PRIMARY KEY,
    resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    metadata JSONB,
    embedding vector(768),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resume_id, chunk_index)
);
```

### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Auto-incrementing primary key |
| `resume_id` | INTEGER | Foreign key to `resumes` table (CASCADE delete) |
| `chunk_index` | INTEGER | Sequential index of chunk within resume (0-based) |
| `text` | TEXT | Actual text content of the chunk |
| `metadata` | JSONB | Additional metadata (user_id, file_name, etc.) |
| `embedding` | vector(768) | Vector embedding from text-embedding-004 |
| `created_at` | TIMESTAMP | When the chunk was created |

### Constraints

- **Primary Key:** `id`
- **Foreign Key:** `resume_id` → `resumes(id)` with `ON DELETE CASCADE`
- **Unique:** `(resume_id, chunk_index)` - Ensures unique chunk ordering per resume

---

## Key Features

### 1. Direct Resume Linkage

✅ Each chunk is directly linked to a resume via `resume_id`  
✅ Foreign key ensures referential integrity  
✅ CASCADE delete automatically removes chunks when resume is deleted

### 2. Chunk Ordering

✅ `chunk_index` maintains the original order of chunks  
✅ Useful for reconstructing the full resume text  
✅ UNIQUE constraint prevents duplicate indexes per resume

### 3. Automatic Cleanup

✅ Deleting a resume automatically deletes all its chunks  
✅ No orphaned chunks possible  
✅ Database-level data integrity

---

## Example Data

```sql
-- Resume ID 1 has 3 chunks
INSERT INTO resume_chunks (resume_id, chunk_index, text, metadata, embedding) VALUES
(1, 0, 'John Doe - Software Engineer...', '{"user_id": "abc123"}', '[0.1, 0.2, ...]'),
(1, 1, 'Experience: Senior Developer at...', '{"user_id": "abc123"}', '[0.3, 0.4, ...]'),
(1, 2, 'Education: BS Computer Science...', '{"user_id": "abc123"}', '[0.5, 0.6, ...]');

-- Resume ID 2 has 2 chunks
INSERT INTO resume_chunks (resume_id, chunk_index, text, metadata, embedding) VALUES
(2, 0, 'Jane Smith - Product Manager...', '{"user_id": "xyz789"}', '[0.7, 0.8, ...]'),
(2, 1, 'Led cross-functional teams...', '{"user_id": "xyz789"}', '[0.9, 1.0, ...]');
```

---

## Indexes

### 1. Primary Key Index
```sql
CREATE INDEX resume_chunks_pkey ON resume_chunks(id);
```
- Automatic, created with PRIMARY KEY

### 2. Resume ID Index
```sql
CREATE INDEX idx_resume_chunks_resume_id ON resume_chunks(resume_id);
```
- Fast lookup of all chunks for a specific resume
- Used when querying chunks by resume

### 3. HNSW Vector Index
```sql
CREATE INDEX idx_resume_chunks_embedding ON resume_chunks 
USING hnsw (embedding vector_cosine_ops);
```
- Enables fast similarity search
- Uses Hierarchical Navigable Small World (HNSW) algorithm
- Optimized for cosine similarity

### 4. Metadata GIN Index
```sql
CREATE INDEX idx_resume_chunks_metadata ON resume_chunks USING gin(metadata);
```
- Fast queries on JSON fields
- Supports queries like `metadata->>'user_id'`

### 5. User ID Index
```sql
CREATE INDEX idx_resume_chunks_user_id ON resume_chunks 
((metadata->>'user_id'));
```
- Fast filtering by user_id in metadata
- Useful for user-scoped queries

---

## Common Queries

### Get all chunks for a resume (in order)

```sql
SELECT id, chunk_index, text, metadata
FROM resume_chunks
WHERE resume_id = 123
ORDER BY chunk_index ASC;
```

### Count chunks per resume

```sql
SELECT resume_id, COUNT(*) as chunk_count
FROM resume_chunks
GROUP BY resume_id;
```

### Get chunks for a user's resumes

```sql
SELECT rc.*, r.title as resume_title
FROM resume_chunks rc
JOIN resumes r ON rc.resume_id = r.id
WHERE r.user_id = 456
ORDER BY r.id, rc.chunk_index;
```

### Reconstruct full resume text

```sql
SELECT string_agg(text, E'\n' ORDER BY chunk_index) as full_text
FROM resume_chunks
WHERE resume_id = 123;
```

### Find resumes containing specific text

```sql
SELECT DISTINCT r.id, r.title, COUNT(rc.id) as matching_chunks
FROM resumes r
JOIN resume_chunks rc ON r.id = rc.resume_id
WHERE rc.text ILIKE '%python%'
GROUP BY r.id, r.title;
```

### Delete all chunks for a resume (manual, but CASCADE does this automatically)

```sql
DELETE FROM resume_chunks WHERE resume_id = 123;

-- Or just delete the resume (chunks auto-deleted via CASCADE)
DELETE FROM resumes WHERE id = 123;
```

---

## Cascade Delete Behavior

When a resume is deleted, **all associated chunks are automatically deleted**:

```sql
-- User deletes resume via API
DELETE FROM resumes WHERE id = 123;

-- PostgreSQL automatically executes:
-- DELETE FROM resume_chunks WHERE resume_id = 123;
```

This ensures:
- ✅ No orphaned chunks
- ✅ Consistent database state
- ✅ Automatic cleanup
- ✅ Less code to maintain

---

## Usage in Code

### TypeScript Service (ResumeChunkService)

```typescript
import { ResumeChunkService } from './services/ResumeChunkService';

const chunkService = new ResumeChunkService(pool);

// Get all chunks for a resume
const chunks = await chunkService.getChunksByResumeId(123);

// Count chunks
const count = await chunkService.getChunkCount(123);

// Delete chunks (manual)
await chunkService.deleteChunksByResumeId(123);

// Reconstruct full text
const fullText = await chunkService.reconstructResumeText(123);

// Get stats
const stats = await chunkService.getUserChunkStats(userId);
```

### Storing Chunks (in Upload Route)

```typescript
// When uploading a resume
const docs = await splitter.splitDocuments(rawDocs);

const docsWithMetadata = docs.map((doc, index) => ({
  ...doc,
  metadata: {
    user_id: userId,
    resume_id: resume.id,      // Links to resume
    chunk_index: index,        // Maintains order
    file_name: req.file.originalname,
  },
}));

await vectorStore.addDocuments(docsWithMetadata);
```

---

## Benefits of This Design

### ✅ Data Integrity
- Foreign key ensures chunks always belong to a valid resume
- CASCADE delete prevents orphaned data
- UNIQUE constraint ensures chunk ordering integrity

### ✅ Performance
- Direct resume_id lookup (no need to parse metadata)
- Indexed for fast queries
- HNSW index for efficient similarity search

### ✅ Query Simplicity
- JOIN with resumes table is straightforward
- Easy to filter by resume, user, or both
- chunk_index makes reconstruction trivial

### ✅ Automatic Cleanup
- Deleting a resume automatically deletes chunks
- No manual cleanup needed
- Database handles referential integrity

### ✅ Scalability
- Efficient indexes support large datasets
- Vector index (HNSW) scales well
- Partition-friendly (can partition by user_id or resume_id)

---

## Maintenance Queries

### Check for orphaned chunks (should return 0)

```sql
SELECT COUNT(*)
FROM resume_chunks rc
LEFT JOIN resumes r ON rc.resume_id = r.id
WHERE r.id IS NULL;
```

### Get chunk distribution

```sql
SELECT 
  COUNT(DISTINCT resume_id) as total_resumes,
  COUNT(*) as total_chunks,
  AVG(chunk_count) as avg_chunks_per_resume,
  MIN(chunk_count) as min_chunks,
  MAX(chunk_count) as max_chunks
FROM (
  SELECT resume_id, COUNT(*) as chunk_count
  FROM resume_chunks
  GROUP BY resume_id
) subquery;
```

### Find resumes with no chunks

```sql
SELECT r.id, r.title, r.file_name
FROM resumes r
LEFT JOIN resume_chunks rc ON r.id = rc.resume_id
WHERE rc.id IS NULL;
```

### Table size

```sql
SELECT pg_size_pretty(pg_total_relation_size('resume_chunks')) as size;
```

---

## Migration from Old Schema

If you previously used UUID-based chunks with resume_id in metadata:

```sql
-- Backup old data
CREATE TABLE resume_chunks_backup AS SELECT * FROM resume_chunks;

-- Drop old table
DROP TABLE resume_chunks;

-- Run new migration
-- (003_create_vector_store.sql)

-- Data would need to be re-embedded with new structure
-- The old chunks cannot be directly migrated due to different structure
```

**Recommendation:** Re-upload resumes to populate the new structure.

---

## Summary

The `resume_chunks` table provides:

- 🔗 **Direct linkage** to resumes via foreign key
- 📊 **Ordered chunks** via chunk_index
- 🗑️ **Auto cleanup** via CASCADE delete
- 🚀 **Fast queries** via optimized indexes
- 🎯 **Vector search** via HNSW index
- ✅ **Data integrity** via constraints

This design makes it easy to manage, query, and maintain resume chunks for AI-powered interviews!
