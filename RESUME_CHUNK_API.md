# Resume Chunk API Endpoints

## Overview

These endpoints allow you to interact with resume chunks - the text segments extracted from resumes and stored with vector embeddings for AI-powered interviews.

---

## Endpoints

### 1. Upload Resume (creates chunks automatically)

**Endpoint:** `POST /api/user/resumes/upload`

**Description:** Uploads a PDF resume, extracts text, creates chunks, and generates vector embeddings.

**Response includes chunk statistics:**

```json
{
  "message": "Resume uploaded and embedded successfully",
  "resume": {
    "id": 123,
    "title": "Software Engineer Resume",
    "file_name": "john_doe_resume.pdf",
    "is_primary": true,
    "created_at": "2025-10-17T..."
  },
  "embeddings_created": true,
  "chunks": 15,
  "user_stats": {
    "total_chunks": 45,
    "total_resumes_with_chunks": 3,
    "avg_chunks_per_resume": 15.0
  }
}
```

---

### 2. Get Resume Chunks

**Endpoint:** `GET /api/user/resumes/:id/chunks`

**Authentication:** Required

**Description:** Retrieves all chunks for a specific resume with metadata.

**Example Request:**

```bash
curl -X GET http://localhost:5000/api/user/resumes/123/chunks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "resume_id": 123,
  "resume_title": "Software Engineer Resume",
  "chunk_count": 15,
  "chunks": [
    {
      "id": 1,
      "chunk_index": 0,
      "text_preview": "John Doe - Software Engineer with 5 years of experience in full-stack development. Proficient i...",
      "text_length": 487,
      "metadata": {
        "user_id": "firebase_uid_here",
        "resume_id": 123,
        "chunk_index": 0,
        "file_name": "john_doe_resume.pdf"
      },
      "created_at": "2025-10-17T12:34:56.789Z"
    },
    {
      "id": 2,
      "chunk_index": 1,
      "text_preview": "Experience: Senior Software Engineer at Tech Corp (2020-Present) - Led development of microserv...",
      "text_length": 512,
      "metadata": {
        "user_id": "firebase_uid_here",
        "resume_id": 123,
        "chunk_index": 1,
        "file_name": "john_doe_resume.pdf"
      },
      "created_at": "2025-10-17T12:34:56.789Z"
    }
    // ... more chunks
  ]
}
```

**Use Cases:**
- View how your resume was chunked
- Debug chunking strategy
- Verify chunk ordering
- Check metadata

---

### 3. Get Full Text Reconstruction

**Endpoint:** `GET /api/user/resumes/:id/fulltext`

**Authentication:** Required

**Description:** Reconstructs the full resume text from all chunks in the correct order.

**Example Request:**

```bash
curl -X GET http://localhost:5000/api/user/resumes/123/fulltext \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "resume_id": 123,
  "resume_title": "Software Engineer Resume",
  "file_name": "john_doe_resume.pdf",
  "full_text": "John Doe - Software Engineer\n\nExperience:\nSenior Software Engineer at Tech Corp (2020-Present)\n- Led development of microservices architecture\n...",
  "text_length": 7342
}
```

**Use Cases:**
- Extract full text without downloading PDF
- Text analysis
- Search indexing
- Content verification
- Compare extracted text vs PDF

---

### 4. Get User Chunk Statistics

**Endpoint:** `GET /api/user/resumes/chunks/stats`

**Authentication:** Required

**Description:** Get aggregate statistics about all your resume chunks.

**Example Request:**

```bash
curl -X GET http://localhost:5000/api/user/resumes/chunks/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "user_id": 456,
  "total_chunks": 45,
  "resumes_with_chunks": 3,
  "avg_chunks_per_resume": 15.0
}
```

**Use Cases:**
- Dashboard statistics
- Storage usage monitoring
- Resume processing overview
- User activity tracking

---

## How Chunking Works

### Process Flow

1. **Upload PDF** → `POST /api/user/resumes/upload`
2. **Extract Text** → PDFLoader extracts all text from PDF
3. **Split into Chunks** → CharacterTextSplitter (500 chars, 100 overlap)
4. **Add Metadata** → user_id, resume_id, chunk_index, file_name
5. **Generate Embeddings** → Google text-embedding-004 (768 dimensions)
6. **Store in Database** → resume_chunks table with vector index

### Chunk Parameters

- **Chunk Size:** 500 characters
- **Overlap:** 100 characters
- **Why overlap?** Ensures context isn't lost at boundaries
- **Ordering:** Maintained via `chunk_index` (0-based)

### Example Chunking

Original text (1200 chars):
```
John Doe - Software Engineer with 5 years... [chunk 0: chars 0-500]
...experience in full-stack development... [chunk 1: chars 400-900]
...Led team of 5 developers on microservices... [chunk 2: chars 800-1200]
```

Notice chunks 0-1 overlap from chars 400-500, and chunks 1-2 overlap from chars 800-900.

---

## Database Schema

### resume_chunks Table

```sql
CREATE TABLE resume_chunks (
    id SERIAL PRIMARY KEY,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    metadata JSONB,
    embedding vector(768),
    created_at TIMESTAMP,
    UNIQUE(resume_id, chunk_index)
);
```

### Automatic Cleanup

When you delete a resume, all its chunks are automatically deleted via CASCADE:

```sql
DELETE FROM resumes WHERE id = 123;
-- Automatically deletes all chunks with resume_id = 123
```

---

## Code Examples

### JavaScript/TypeScript

#### Get chunks for a resume

```typescript
const response = await fetch(
  `http://localhost:5000/api/user/resumes/${resumeId}/chunks`,
  {
    headers: {
      Authorization: `Bearer ${firebaseToken}`,
    },
  }
);

const data = await response.json();
console.log(`Resume has ${data.chunk_count} chunks`);
data.chunks.forEach((chunk) => {
  console.log(`Chunk ${chunk.chunk_index}: ${chunk.text_preview}`);
});
```

#### Get full reconstructed text

```typescript
const response = await fetch(
  `http://localhost:5000/api/user/resumes/${resumeId}/fulltext`,
  {
    headers: {
      Authorization: `Bearer ${firebaseToken}`,
    },
  }
);

const data = await response.json();
console.log("Full resume text:", data.full_text);
```

#### Get user statistics

```typescript
const response = await fetch(
  "http://localhost:5000/api/user/resumes/chunks/stats",
  {
    headers: {
      Authorization: `Bearer ${firebaseToken}`,
    },
  }
);

const stats = await response.json();
console.log(
  `You have ${stats.total_chunks} chunks across ${stats.resumes_with_chunks} resumes`
);
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid resume ID"
}
```

### 401 Unauthorized

```json
{
  "error": "No user ID"
}
```

### 404 Not Found

```json
{
  "error": "Resume not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to get resume chunks"
}
```

---

## Performance Considerations

### Chunk Count Guidelines

| Resume Pages | Typical Chunks | Storage Impact |
|--------------|----------------|----------------|
| 1 page | 3-5 chunks | ~15KB |
| 2 pages | 8-12 chunks | ~40KB |
| 3+ pages | 15-20 chunks | ~75KB |

### Indexes

All chunk queries are optimized with indexes:
- `resume_id` - Fast lookup by resume
- `chunk_index` - Fast ordering
- `embedding` (HNSW) - Fast similarity search
- `metadata` (GIN) - Fast JSON queries

### Caching

Consider caching:
- Full text reconstruction (infrequent changes)
- Chunk statistics (updated on upload/delete only)
- Individual chunks (rarely change)

---

## Use Cases

### 1. Resume Preview

Show users how their resume was processed:

```typescript
// Get chunks and show preview
const chunks = await getResumeChunks(resumeId);
return (
  <div>
    <h3>Resume Chunks ({chunks.chunk_count})</h3>
    {chunks.chunks.map((chunk) => (
      <div key={chunk.id}>
        <strong>Chunk {chunk.chunk_index + 1}:</strong>
        <p>{chunk.text_preview}</p>
      </div>
    ))}
  </div>
);
```

### 2. Text Search

Search across resume text without downloading PDFs:

```typescript
const fullText = await getResumeFullText(resumeId);
const matches = fullText.match(/python|javascript|react/gi);
console.log(`Found ${matches?.length} skill mentions`);
```

### 3. Storage Analytics

Monitor storage usage:

```typescript
const stats = await getUserChunkStats();
const storageKB = stats.total_chunks * 3; // ~3KB per chunk avg
console.log(`Using approximately ${storageKB}KB for embeddings`);
```

### 4. Quality Assurance

Verify chunks were created correctly after upload:

```typescript
const uploadResult = await uploadResume(file);
const chunks = await getResumeChunks(uploadResult.resume.id);

if (chunks.chunk_count !== uploadResult.chunks) {
  console.error("Chunk count mismatch!");
}
```

---

## Summary

The Resume Chunk API provides:

- 📄 **Chunk Viewing** - See how resumes are split
- 📝 **Text Reconstruction** - Get full text from chunks
- 📊 **Statistics** - Monitor chunk usage
- 🔗 **Automatic Linking** - Chunks tied to resume_id
- 🗑️ **Auto Cleanup** - CASCADE delete with resume
- ⚡ **Fast Queries** - Optimized indexes

These endpoints make resume chunk management transparent and easy to work with!
