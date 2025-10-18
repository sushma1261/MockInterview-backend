# Resume Upload API Documentation

## New Resume Upload Endpoint

### Upload Resume (with PostgreSQL Storage)

**Endpoint:** `POST /api/user/resumes/upload`

**Authentication:** Required (Firebase JWT)

**Content-Type:** `multipart/form-data`

**Description:** 
Uploads a PDF resume, saves it to PostgreSQL database, and creates vector embeddings for AI-powered interview questions.

---

### Request

#### Headers
```
Authorization: Bearer <firebase-jwt-token>
Content-Type: multipart/form-data
```

#### Form Data Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resume` | File | Yes | PDF file to upload (max 10MB) |
| `title` | String | No | Resume title (defaults to filename without .pdf) |
| `is_primary` | Boolean/String | No | Set as primary resume (default: false) |

---

### Response

#### Success Response (201 Created)

```json
{
  "message": "Resume uploaded and embedded successfully",
  "resume": {
    "id": 1,
    "title": "Software Engineer Resume",
    "file_name": "john_doe_resume.pdf",
    "is_primary": true,
    "created_at": "2025-10-17T12:34:56.789Z"
  },
  "embeddings_created": true,
  "chunks": 15
}
```

#### Success Response (AI Disabled)

```json
{
  "message": "Resume uploaded successfully (AI disabled)",
  "resume": {
    "id": 1,
    "title": "Software Engineer Resume",
    "file_name": "john_doe_resume.pdf",
    "is_primary": true,
    "created_at": "2025-10-17T12:34:56.789Z"
  },
  "embeddings_created": false
}
```

#### Error Responses

**400 Bad Request** - No file uploaded
```json
{
  "error": "No file uploaded"
}
```

**400 Bad Request** - Invalid PDF
```json
{
  "error": "Invalid PDF file"
}
```

**401 Unauthorized** - Missing or invalid token
```json
{
  "error": "No user ID"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to process resume"
}
```

---

### Example Usage

#### cURL

```bash
curl -X POST http://localhost:5000/api/user/resumes/upload \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -F "resume=@/path/to/resume.pdf" \
  -F "title=Senior Software Engineer Resume" \
  -F "is_primary=true"
```

#### JavaScript (Fetch API)

```javascript
const formData = new FormData();
formData.append('resume', fileInput.files[0]);
formData.append('title', 'My Resume');
formData.append('is_primary', 'true');

const response = await fetch('http://localhost:5000/api/user/resumes/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${firebaseToken}`
  },
  body: formData
});

const result = await response.json();
console.log('Upload result:', result);
```

#### Postman

1. Set method to `POST`
2. URL: `http://localhost:5000/api/user/resumes/upload`
3. Headers:
   - `Authorization: Bearer <your-firebase-token>`
4. Body (form-data):
   - Key: `resume`, Type: File, Value: Select your PDF file
   - Key: `title`, Type: Text, Value: "My Resume Title"
   - Key: `is_primary`, Type: Text, Value: "true"

---

## What Happens When You Upload

1. **User Authentication** - Verifies Firebase JWT token
2. **User Profile** - Gets or creates user profile in database
3. **PDF Processing** - Extracts text content from PDF
4. **Database Storage** - Saves resume metadata to `resumes` table:
   - Title, filename, file path, file size
   - Full text content
   - Primary resume flag
5. **Vector Embeddings** (if AI enabled):
   - Splits text into chunks (500 chars, 100 overlap)
   - Creates embeddings using OpenAI
   - Stores in pgvector for semantic search
6. **Returns** - Resume record with ID and embedding status

---

## Comparison with Legacy Endpoint

### New Endpoint: `/api/user/resumes/upload`
✅ Saves to PostgreSQL `resumes` table  
✅ Creates vector embeddings  
✅ Returns resume ID and metadata  
✅ Supports title and primary flag  
✅ Authenticated with Firebase  
✅ Keeps uploaded PDF file  

### Legacy Endpoint: `/new/resume/upload/pdf`
❌ Does NOT save to PostgreSQL  
✅ Creates vector embeddings  
❌ Returns only chunk count  
❌ No title or primary flag support  
✅ Authenticated with Firebase  
❌ Deletes uploaded PDF file after processing  

**Recommendation:** Use the new `/api/user/resumes/upload` endpoint for all new resume uploads.

---

## Database Schema

The resume is stored in the `resumes` table:

```sql
CREATE TABLE resumes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255),
    file_path TEXT,
    file_size INTEGER,
    content TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Related Endpoints

After uploading a resume, you can use these endpoints:

- `GET /api/user/resumes` - List all resumes
- `GET /api/user/resumes/primary` - Get primary resume
- `GET /api/user/resumes/:id` - Get specific resume
- `PUT /api/user/resumes/:id` - Update resume metadata
- `DELETE /api/user/resumes/:id` - Delete resume
- `PUT /api/user/resumes/:id/set-primary` - Set as primary resume

---

## Notes

- Only PDF files are accepted
- Maximum file size: 10MB
- Resume content is extracted and stored as plain text
- If set as primary, all other resumes are automatically marked as non-primary
- Vector embeddings are linked to the resume ID for future reference
- Uploaded files are kept in the `uploads/` directory
