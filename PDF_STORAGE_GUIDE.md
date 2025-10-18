# PDF Storage in PostgreSQL - Guide

## Overview

Your MockInterview backend now supports **two methods** for storing resume PDF files:

1. **File System Storage** (default) - PDF stored in `uploads/` folder, path in database
2. **Database Storage** (optional) - PDF binary data stored directly in PostgreSQL as BYTEA

---

## Database Schema

### Migration Added

File: `src/db/migrations/002_add_pdf_storage.sql`

```sql
ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS file_data BYTEA;
```

### Resume Table Structure

```sql
CREATE TABLE resumes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255),
    file_path TEXT,              -- Path to file on disk (OR use this)
    file_size INTEGER,
    content TEXT,                -- Extracted text content
    file_data BYTEA,             -- Binary PDF data (OR use this)
    is_primary BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Note:** You can use either `file_path` OR `file_data`, not both. The system supports both for flexibility.

---

## API Endpoints

### 1. Upload Resume (with storage option)

**Endpoint:** `POST /api/user/resumes/upload`

**Form Data:**
- `resume` (file) - PDF file to upload
- `title` (string, optional) - Resume title
- `is_primary` (boolean, optional) - Set as primary resume
- **`store_in_db` (boolean, optional)** - Store PDF in database vs filesystem

#### Example: Store on Filesystem (default)

```bash
curl -X POST http://localhost:5000/api/user/resumes/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "resume=@resume.pdf" \
  -F "title=My Resume"
```

Result:
- ✅ PDF saved to `uploads/` folder
- ✅ `file_path` = "uploads/123456-resume.pdf"
- ✅ `file_data` = NULL

#### Example: Store in Database

```bash
curl -X POST http://localhost:5000/api/user/resumes/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "resume=@resume.pdf" \
  -F "title=My Resume" \
  -F "store_in_db=true"
```

Result:
- ✅ PDF binary data saved to database
- ✅ `file_data` = <Buffer ... >
- ✅ `file_path` = NULL
- ✅ Uploaded file can be deleted from disk

### 2. Download Resume

**Endpoint:** `GET /api/user/resumes/:id/download`

**Description:** Downloads the PDF file (from database or filesystem)

```bash
curl -X GET http://localhost:5000/api/user/resumes/123/download \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o downloaded_resume.pdf
```

The endpoint automatically:
- Checks if `file_data` exists → serves from database
- Otherwise checks `file_path` → serves from filesystem
- Returns 404 if neither exists

---

## When to Use Each Storage Method

### Use **Filesystem Storage** when:
- ✅ You have reliable file storage (local disk, NFS, S3)
- ✅ You want smaller database size
- ✅ You're using object storage (future: S3, Google Cloud Storage)
- ✅ Database backup/restore needs to be fast
- ✅ Files are large (> 1MB)

### Use **Database Storage** when:
- ✅ You want complete ACID transactions (file + metadata)
- ✅ You need guaranteed data consistency
- ✅ You want simplified backup (one database dump)
- ✅ You're deploying to platforms without persistent storage
- ✅ Files are small (< 1MB)
- ✅ You're using managed databases with good BYTEA support

---

## Code Examples

### JavaScript/TypeScript - Upload to Database

```javascript
const formData = new FormData();
formData.append('resume', pdfFile);
formData.append('title', 'Software Engineer Resume');
formData.append('store_in_db', 'true'); // Store in database

const response = await fetch('/api/user/resumes/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const result = await response.json();
console.log('Resume ID:', result.resume.id);
```

### Download Resume

```javascript
// Download resume (works for both storage methods)
const response = await fetch(`/api/user/resumes/${resumeId}/download`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'resume.pdf';
a.click();
```

---

## Migration Instructions

### Apply the Migration

```bash
# Run inside Docker container
docker compose exec postgres psql -U system -d mockinterview -f /app/src/db/migrations/002_add_pdf_storage.sql

# Or from your migration script
npm run migrate
```

### Verify Migration

```sql
-- Check if column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'resumes' AND column_name = 'file_data';
```

---

## Storage Size Considerations

### PostgreSQL BYTEA Limits
- **Maximum single value:** ~1GB (theoretical)
- **Recommended max:** 10-50MB per file
- **Page size impact:** Large BYTEA can cause table bloat

### Recommendations
- **Small resumes (< 1MB):** Either method works fine
- **Medium resumes (1-10MB):** Filesystem preferred for performance
- **Large resumes (> 10MB):** Definitely use filesystem or object storage

---

## Performance Comparison

| Operation | Filesystem | Database (BYTEA) |
|-----------|------------|------------------|
| Upload | Fast | Slower (writes to DB) |
| Download | Fast | Medium (reads from DB) |
| Backup | Separate files | Included in DB dump |
| Consistency | Risk of orphans | Guaranteed |
| Scalability | Better | Limited by DB size |

---

## Hybrid Approach (Recommended)

You can use **both** methods based on file size:

```typescript
// In resumeUpload.route.ts
const MAX_DB_SIZE = 1024 * 1024; // 1MB
const storeInDB = req.file.size <= MAX_DB_SIZE;

const resume = await resumeService.createResume(userProfile.id, {
  title: resumeTitle,
  file_name: req.file.originalname,
  file_path: storeInDB ? undefined : req.file.path,
  file_size: req.file.size,
  content: fullText,
  file_data: storeInDB ? pdfBuffer : undefined,
  is_primary: isPrimary,
});
```

---

## Troubleshooting

### Database Size Growing Too Large?

```sql
-- Check total size of file_data column
SELECT pg_size_pretty(pg_total_relation_size('resumes')) as total_size;

-- Count resumes stored in database vs filesystem
SELECT 
  COUNT(CASE WHEN file_data IS NOT NULL THEN 1 END) as stored_in_db,
  COUNT(CASE WHEN file_path IS NOT NULL THEN 1 END) as stored_on_disk
FROM resumes;
```

### Convert Existing Resumes to Database Storage

```sql
-- Example: Move small files to database
-- (Run this as a data migration script, not in production)
UPDATE resumes
SET file_data = pg_read_binary_file(file_path),
    file_path = NULL
WHERE file_size < 1048576 AND file_data IS NULL;
```

---

## Security Considerations

1. **Access Control:** Download endpoint checks user ownership
2. **File Validation:** Only PDF files accepted (validated by multer)
3. **Size Limits:** 10MB max upload size (configurable)
4. **No Directory Traversal:** Multer handles safe file naming

---

## Summary

✅ **Added:** BYTEA column for PDF binary storage  
✅ **Supports:** Both filesystem and database storage  
✅ **Flexible:** Choose per-upload via `store_in_db` parameter  
✅ **Download:** Single endpoint handles both storage methods  
✅ **Backward Compatible:** Existing file_path system still works  

Choose the storage method that best fits your deployment architecture and file sizes!
