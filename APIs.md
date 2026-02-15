# Mock Interview Backend - API Documentation

## Base URL
- **Development**: `http://localhost:8080`
- **Production**: As configured in environment

## Authentication
Most endpoints require authentication using Firebase JWT tokens. Include the token in the Authorization header:
```
Authorization: Bearer <firebase-jwt-token>
```

Authentication can be disabled by setting `AUTH_ENABLED=false` in environment variables (for development only).

---

## 📋 Table of Contents
1. [Health & Status](#health--status)
2. [Chat & Interview APIs](#chat--interview-apis)
3. [User Profile APIs](#user-profile-apis)
4. [Resume Management APIs](#resume-management-apis)
5. [Session Management APIs](#session-management-apis)
6. [Interview History APIs](#interview-history-apis)
7. [Recruitment System APIs](#recruitment-system-apis)

---

## Health & Status

### GET /
**Description**: Basic health check  
**Authentication**: None  
**Response**: `"Mock Interview Backend Running 🚀"`

### GET /health
**Description**: Detailed health check endpoint  
**Authentication**: None  
**Response**: Health status information

---

## Chat & Interview APIs

Base path: `/api`

### POST /api/chat
**Description**: Non-streaming chat endpoint for conducting mock interviews  
**Authentication**: Required  
**Request Body**:
```json
{
  "action": "start|continue|end",
  "message": "User's message/answer",
  "job_description": "Optional job description text",
  "resume_id": 123,  // Optional: specify which resume to use
  "job_title": "Software Engineer",  // Optional
  "company_name": "Google"  // Optional
}
```
**Response**:
```json
{
  "message": "AI response",
  "action": "start|continue|end",
  "turnCount": 5,
  "hasJobDescription": true,
  "sessionEnded": false,
  "analysis": {
    "strengths": ["point1", "point2"],
    "improvements": ["point1", "point2"],
    "score": 8.5
  }
}
```

### POST /api/chat/stream
**Description**: Streaming chat endpoint using Server-Sent Events (SSE)  
**Authentication**: Required  
**Request Body**: Same as `/api/chat`  
**Response**: SSE stream with chunks:
```json
// Chunk events
{"type": "chunk", "content": "partial text", "timestamp": 1234567890}

// Final event
{"type": "final", "response": {...}, "timestamp": 1234567890}

// Error event
{"type": "error", "error": "Error message", "timestamp": 1234567890}
```

### POST /api/chat/clear
**Description**: Clear the current chat session for the user  
**Authentication**: Required  
**Response**:
```json
{
  "success": true,
  "message": "Chat session cleared"
}
```

### GET /api/chat/status
**Description**: Get the current chat session status  
**Authentication**: Required  
**Response**:
```json
{
  "has_active_session": true,
  "turn_count": 5,
  "has_history": true,
  "has_job_description": true
}
```

### POST /api/chat/resume/:sessionId
**Description**: Resume an in-progress interview session from database  
**Authentication**: Required  
**URL Parameters**: `sessionId` - Session ID to resume  
**Response**:
```json
{
  "success": true,
  "message": "Session resumed successfully",
  "session": {...},
  "messageCount": 10
}
```

---

## User Profile APIs

Base path: `/api/user`

All user profile endpoints require authentication.

### GET /api/user/profile
**Description**: Get the current user's profile  
**Authentication**: Required  
**Response**:
```json
{
  "id": 1,
  "firebase_uid": "abc123",
  "email": "user@example.com",
  "display_name": "John Doe",
  "photo_url": "https://...",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### PUT /api/user/profile
**Description**: Update the current user's profile  
**Authentication**: Required  
**Request Body**:
```json
{
  "display_name": "John Doe",
  "photo_url": "https://..."
}
```

### DELETE /api/user/profile
**Description**: Delete the current user's profile and all associated data  
**Authentication**: Required  
**Response**: `200 OK`

---

## User Preferences APIs

### GET /api/user/preferences
**Description**: Get user's interview preferences  
**Authentication**: Required  
**Response**:
```json
{
  "id": 1,
  "user_id": 1,
  "interview_difficulty": "medium",
  "interview_duration": 30,
  "preferred_languages": ["JavaScript", "Python"],
  "theme": "dark"
}
```

### PUT /api/user/preferences
**Description**: Update user's interview preferences  
**Authentication**: Required  
**Request Body**:
```json
{
  "interview_difficulty": "hard",
  "interview_duration": 45,
  "preferred_languages": ["JavaScript", "Python", "Go"],
  "theme": "dark"
}
```

---

## Resume Management APIs

Base path: `/api/user/resumes`

### POST /api/user/resumes/upload
**Description**: Upload a new resume (PDF only)  
**Authentication**: Required  
**Content-Type**: `multipart/form-data`  
**Form Data**:
- `resume`: PDF file (max 10MB)
- `title`: Optional resume title
- `is_primary`: Boolean, set as primary resume
- `store_in_db`: Boolean, store in database vs disk

**Response**:
```json
{
  "message": "Resume uploaded and embedded successfully",
  "resume": {
    "id": 123,
    "title": "Software Engineer Resume",
    "file_name": "resume.pdf",
    "is_primary": true,
    "created_at": "2024-01-01T00:00:00Z"
  },
  "embeddings_created": true,
  "chunks": 15
}
```

### GET /api/user/resumes
**Description**: Get all resumes for the current user  
**Authentication**: Required  
**Response**:
```json
[
  {
    "id": 123,
    "title": "Software Engineer Resume",
    "file_name": "resume.pdf",
    "file_size": 204800,
    "is_primary": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### GET /api/user/resumes/primary
**Description**: Get the user's primary resume  
**Authentication**: Required  
**Response**: Resume object (same as above)

### GET /api/user/resumes/:id
**Description**: Get a specific resume by ID  
**Authentication**: Required  
**URL Parameters**: `id` - Resume ID  
**Response**: Resume object

### GET /api/user/resumes/:id/download
**Description**: Download resume PDF file  
**Authentication**: Required  
**URL Parameters**: `id` - Resume ID  
**Response**: PDF file download

### PUT /api/user/resumes/:id
**Description**: Update resume metadata  
**Authentication**: Required  
**URL Parameters**: `id` - Resume ID  
**Request Body**:
```json
{
  "title": "Updated Resume Title",
  "is_primary": true
}
```

### DELETE /api/user/resumes/:id
**Description**: Delete a resume and all associated data  
**Authentication**: Required  
**URL Parameters**: `id` - Resume ID

### PUT /api/user/resumes/:id/set-primary
**Description**: Set a resume as the primary resume  
**Authentication**: Required  
**URL Parameters**: `id` - Resume ID

### GET /api/user/resumes/:id/chunks
**Description**: Get all text chunks for a resume (used for embeddings)  
**Authentication**: Required  
**URL Parameters**: `id` - Resume ID  
**Response**:
```json
{
  "resume_id": 123,
  "resume_title": "Software Engineer Resume",
  "chunk_count": 15,
  "chunks": [
    {
      "id": 1,
      "chunk_index": 0,
      "text_preview": "John Doe...",
      "text_length": 500,
      "metadata": {...},
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### GET /api/user/resumes/:id/fulltext
**Description**: Get reconstructed full text from all chunks  
**Authentication**: Required  
**URL Parameters**: `id` - Resume ID  
**Response**:
```json
{
  "resume_id": 123,
  "resume_title": "Software Engineer Resume",
  "file_name": "resume.pdf",
  "full_text": "Complete resume text...",
  "text_length": 5000
}
```

### GET /api/user/resumes/chunks/stats
**Description**: Get chunk statistics for user's resumes  
**Authentication**: Required  
**Response**:
```json
{
  "user_id": 1,
  "total_chunks": 45,
  "resumes_with_chunks": 3,
  "avg_chunks_per_resume": 15.0
}
```

---

## Session Management APIs

Base path: `/api/sessions`

### GET /api/sessions/stats
**Description**: Get Redis session statistics  
**Authentication**: Required  
**Response**:
```json
{
  "totalSessions": 10,
  "activeUserCount": 5,
  "cleanupSchedulerRunning": true
}
```

### GET /api/sessions/me
**Description**: Get current user's session information  
**Authentication**: Required  
**Response**:
```json
{
  "userId": "firebase-uid",
  "hasActiveSession": true,
  "turnCount": 5,
  "metadata": {...}
}
```

### DELETE /api/sessions/me
**Description**: Clear current user's session from Redis  
**Authentication**: Required  
**Response**:
```json
{
  "message": "Session cleared successfully",
  "userId": "firebase-uid"
}
```

### POST /api/sessions/cleanup
**Description**: Force cleanup of stale sessions (Admin only)  
**Authentication**: Required (Admin role)  
**Response**:
```json
{
  "message": "Cleanup completed",
  "sessionsRemoved": 3
}
```

---

## Interview History APIs

Base path: `/api/history`

### GET /api/history
**Description**: Get all interview sessions for the authenticated user  
**Authentication**: Required  
**Query Parameters**:
- `resume_id`: Filter by resume ID (optional)
- `status`: Filter by status (optional)
- `limit`: Limit results (optional)

**Response**:
```json
{
  "success": true,
  "count": 10,
  "sessions": [
    {
      "id": 1,
      "user_id": 1,
      "resume_id": 123,
      "job_description_id": 456,
      "session_status": "completed",
      "total_questions": 10,
      "questions_answered": 10,
      "started_at": "2024-01-01T00:00:00Z",
      "completed_at": "2024-01-01T01:00:00Z",
      "duration_minutes": 60
    }
  ]
}
```

### GET /api/history/:sessionId
**Description**: Get detailed information for a specific session  
**Authentication**: Required  
**URL Parameters**: `sessionId` - Session ID  
**Response**:
```json
{
  "success": true,
  "session": {...},
  "messages": [...],
  "feedback": [...]
}
```

### GET /api/history/:sessionId/conversation
**Description**: Get conversation history as formatted text  
**Authentication**: Required  
**URL Parameters**: `sessionId` - Session ID  
**Query Parameters**: `limit` - Limit messages (optional)  
**Response**:
```json
{
  "success": true,
  "sessionId": 1,
  "conversation": "Formatted conversation text..."
}
```

### GET /api/history/stats/summary
**Description**: Get user statistics and performance metrics  
**Authentication**: Required  
**Response**:
```json
{
  "success": true,
  "stats": {
    "totalSessions": 10,
    "completedSessions": 8,
    "averageScore": 7.5,
    "totalQuestionsAnswered": 80
  }
}
```

---

## Recruitment System APIs

Base path: `/api/recruitment`

### 🔐 Role Management

#### GET /api/recruitment/roles/my-roles
**Description**: Get current user's roles  
**Authentication**: Required  
**Response**:
```json
{
  "user_id": 1,
  "email": "user@example.com",
  "roles": ["candidate", "hr"]
}
```

#### GET /api/recruitment/roles/check
**Description**: Check if user has a specific role  
**Authentication**: Required  
**Query Parameters**: `role` - Role to check  
**Response**:
```json
{
  "hasRole": true,
  "role": "hr"
}
```

#### POST /api/recruitment/roles/register-candidate
**Description**: Self-register as a candidate  
**Authentication**: Required  
**Response**:
```json
{
  "success": true,
  "message": "Successfully registered as candidate",
  "role": "candidate"
}
```

#### GET /api/recruitment/roles/users
**Description**: Get all users with their roles (Admin only)  
**Authentication**: Required (Admin role)  
**Response**: Array of users with roles

#### GET /api/recruitment/roles/users/search
**Description**: Search users (Admin only)  
**Authentication**: Required (Admin role)  
**Query Parameters**: `q` - Search query  

#### GET /api/recruitment/roles/users/:userId
**Description**: Get user roles by ID (Admin/HR only)  
**Authentication**: Required (Admin or HR role)  
**URL Parameters**: `userId` - User ID  

#### PUT /api/recruitment/roles/users/:userId/role
**Description**: Update user role (Admin only)  
**Authentication**: Required (Admin role)  
**URL Parameters**: `userId` - User ID  
**Request Body**:
```json
{
  "role": "hr",
  "department": "Engineering"
}
```

#### POST /api/recruitment/roles/users/bulk-update
**Description**: Bulk update user roles (Admin only)  
**Authentication**: Required (Admin role)  
**Request Body**:
```json
{
  "updates": [
    {"userId": 1, "role": "hr"},
    {"userId": 2, "role": "candidate"}
  ]
}
```

#### POST /api/recruitment/roles/assign
**Description**: Assign role to user (Admin only)  
**Authentication**: Required (Admin role)  
**Request Body**:
```json
{
  "userId": 1,
  "role": "hr",
  "department": "Engineering"
}
```

#### DELETE /api/recruitment/roles/remove
**Description**: Remove role from user (Admin only)  
**Authentication**: Required (Admin role)  
**Request Body**:
```json
{
  "userId": 1,
  "role": "hr"
}
```

#### GET /api/recruitment/roles/hr-users
**Description**: Get all HR users (Admin/HR only)  
**Authentication**: Required (Admin or HR role)

#### GET /api/recruitment/roles/candidates
**Description**: Get all candidates (Admin/HR only)  
**Authentication**: Required (Admin or HR role)

#### GET /api/recruitment/roles/admins
**Description**: Get all admin users (Admin only)  
**Authentication**: Required (Admin role)

---

### 💼 Job Description Management

#### POST /api/recruitment/jobs
**Description**: Create new job description (HR only)  
**Authentication**: Required (HR role)  
**Request Body**:
```json
{
  "title": "Senior Software Engineer",
  "company_name": "Tech Corp",
  "description": "Full job description...",
  "requirements": "Requirements text...",
  "required_skills": ["JavaScript", "React", "Node.js"],
  "required_experience_years": 5,
  "positions_available": 2,
  "status": "active",
  "screening_config": {
    "max_candidates": 10,
    "similarity_threshold": 0.6,
    "application_threshold": 60
  }
}
```

#### GET /api/recruitment/jobs
**Description**: List all job descriptions (HR sees all, candidates see public)  
**Authentication**: Required  
**Query Parameters**:
- `status`: Filter by status (optional)
- `limit`: Limit results (optional)

**Response**:
```json
{
  "success": true,
  "jobs": [...]
}
```

#### GET /api/recruitment/jobs/:id
**Description**: Get single job description  
**Authentication**: Required  
**URL Parameters**: `id` - Job ID

#### PUT /api/recruitment/jobs/:id
**Description**: Update job description (HR who created it only)  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Job ID  
**Request Body**: Same fields as create

#### DELETE /api/recruitment/jobs/:id
**Description**: Delete job description (HR who created it only)  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Job ID

#### GET /api/recruitment/jobs/:id/statistics
**Description**: Get job statistics (HR only)  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Job ID  
**Response**:
```json
{
  "jobId": 1,
  "totalApplications": 50,
  "screened": 50,
  "shortlisted": 10,
  "interviewed": 5,
  "hired": 2,
  "averageScore": 72.5
}
```

---

### 📊 Resume Screening

#### POST /api/recruitment/jobs/:id/screen
**Description**: Screen resumes for a job using AI (returns preview)  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Job ID  
**Response**:
```json
{
  "screeningId": "temp-abc123",
  "results": [
    {
      "resumeId": 123,
      "score": 85.5,
      "analysis": {
        "matchedSkills": ["JavaScript", "React"],
        "missingSkills": ["Docker"],
        "strengths": ["Strong frontend experience"],
        "concerns": ["Limited backend experience"],
        "recommendation": "Highly recommended"
      },
      "applicant": {...}
    }
  ],
  "expiresIn": 300
}
```

#### GET /api/recruitment/screening/:screeningId
**Description**: Get cached screening preview  
**Authentication**: Required (HR role)  
**URL Parameters**: `screeningId` - Screening ID

#### POST /api/recruitment/jobs/:id/applications/create
**Description**: Create applications from screening results (HR only)  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Job ID  
**Request Body**:
```json
{
  "screeningId": "temp-abc123",
  "selectedResumeIds": [123, 456, 789]
}
```

---

### 📝 Application Management

#### GET /api/recruitment/jobs/:jobId/applications
**Description**: Get all applications for a specific job (HR only)  
**Authentication**: Required (HR role)  
**URL Parameters**: `jobId` - Job ID

#### GET /api/recruitment/applications
**Description**: Get all applications across all jobs (Admin/HR only)  
**Authentication**: Required (Admin or HR role)  
**Query Parameters**:
- `status`: Filter by status
- `hr_status`: Filter by HR review status

#### GET /api/recruitment/applications/:id
**Description**: Get single application with details (HR only)  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Application ID

#### PUT /api/recruitment/applications/:id
**Description**: Update application (change status, add notes)  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Application ID  
**Request Body**:
```json
{
  "screening_status": "shortlisted",
  "hr_status": "approved",
  "hr_notes": "Excellent candidate"
}
```

#### POST /api/recruitment/applications/:id/shortlist
**Description**: Shortlist a candidate  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Application ID

#### POST /api/recruitment/applications/:id/reject
**Description**: Reject a candidate  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Application ID  
**Request Body**:
```json
{
  "reason": "Not enough experience"
}
```

#### POST /api/recruitment/applications/:id/approve
**Description**: Approve a candidate  
**Authentication**: Required (HR role)  
**URL Parameters**: `id` - Application ID

#### GET /api/recruitment/applications/bulk-export
**Description**: Export applications (CSV/JSON)  
**Authentication**: Required (HR role)  
**Query Parameters**: `format` - Export format (csv or json)

#### GET /api/recruitment/health
**Description**: Health check for recruitment API  
**Authentication**: None  
**Response**:
```json
{
  "success": true,
  "message": "Recruitment API is running",
  "version": "1.0.0"
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Error message describing what went wrong"
}
```

### 401 Unauthorized
```json
{
  "message": "No token provided"
}
```
or
```json
{
  "message": "Invalid token"
}
```

### 403 Forbidden
```json
{
  "message": "Insufficient permissions",
  "required_roles": ["hr"],
  "your_roles": ["candidate"]
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 409 Conflict
```json
{
  "error": "A resume with this filename already exists",
  "message": "You already have a resume named \"resume.pdf\"",
  "file_name": "resume.pdf"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to process request",
  "details": "Detailed error message"
}
```

---

## User Roles

The system supports role-based access control with the following roles:

- **admin**: First user, full system access, can assign roles
- **hr**: Can post jobs, screen resumes, manage applications
- **candidate**: Can upload resumes, practice interviews
- **interviewer**: Can conduct interviews (future feature)
- **hiring_manager**: Can review candidates (future feature)

Users can have multiple roles simultaneously.

---

## Notes

1. **File Uploads**: Use `multipart/form-data` for resume uploads
2. **Streaming**: SSE endpoints don't return JSON, but event streams
3. **Authentication**: Most endpoints require valid Firebase JWT token
4. **Role Enforcement**: HR and Admin routes enforce role-based access
5. **Resume Processing**: PDF uploads are processed for text extraction and vector embeddings
6. **Session Management**: Redis stores active sessions, PostgreSQL stores complete history
7. **AI Features**: Resume screening and interview questions use Google AI (Gemini)

---

## Environment Configuration

Required environment variables:
- `PORT`: Server port (default: 8080)
- `AUTH_ENABLED`: Enable/disable authentication (default: true)
- `FIREBASE_PROJECT_ID`: Firebase project ID
- `FIREBASE_CLIENT_EMAIL`: Firebase service account email
- `FIREBASE_PRIVATE_KEY`: Firebase service account private key
- `POSTGRES_HOST`: PostgreSQL host
- `POSTGRES_PORT`: PostgreSQL port
- `POSTGRES_USER`: PostgreSQL user
- `POSTGRES_PASSWORD`: PostgreSQL password
- `POSTGRES_DB`: PostgreSQL database name
- `REDIS_URL`: Redis connection URL
- `GOOGLE_API_KEY`: Google AI API key

See `.env.example` for complete configuration template.
