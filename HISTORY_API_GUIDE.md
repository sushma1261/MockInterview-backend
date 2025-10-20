# Interview History API - Quick Reference

## ✅ Implementation Complete!

All three steps have been implemented:
1. ✅ Database migration created (`004_interview_sessions.sql`)
2. ✅ InterviewController integrated with PostgreSQL session tracking
3. ✅ History API endpoints created and registered

---

## 🚀 Setup Instructions

### 1. Run the Migration

```bash
# Option A: Using the migration script
npm run migrate

# Option B: Using psql directly
psql -U your_user -d your_database -f src/db/migrations/004_interview_sessions.sql
```

### 2. Test the Integration

Start your server and test the chat endpoint:

```bash
npm run dev
```

---

## 📡 API Endpoints

### Chat Endpoints (Updated)

#### POST `/api/chat`
Non-streaming chat with PostgreSQL history tracking.

**Request Body:**
```json
{
  "message": "I led a team of 5 developers...",
  "action": "continue",
  "question_number": 2,
  "job_description": "Senior Software Engineer at Google",
  "job_title": "Senior Software Engineer",
  "company_name": "Google",
  "resume_id": 123
}
```

**New Fields:**
- `job_title` (optional) - Title for the job description
- `company_name` (optional) - Company name for the job description
- `resume_id` (optional) - If not provided, uses primary resume

**Response:** Same as before

---

#### POST `/api/chat/stream`
Streaming chat with PostgreSQL history tracking.

**Request/Response:** Same as above, but streams via SSE

---

### History Endpoints (New)

#### GET `/api/history`
Get all interview sessions for the user.

**Query Parameters:**
- `resume_id` (optional) - Filter by resume
- `status` (optional) - Filter by status (in_progress, completed, abandoned)
- `limit` (optional) - Limit number of results

**Example:**
```bash
GET /api/history?resume_id=123&status=completed&limit=10
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "sessions": [
    {
      "id": 1,
      "resume_id": 123,
      "resume_title": "Software Engineer Resume",
      "job_title": "Senior Backend Engineer",
      "company_name": "Google",
      "session_status": "completed",
      "total_questions": 5,
      "questions_answered": 5,
      "started_at": "2025-10-18T10:30:00Z",
      "completed_at": "2025-10-18T10:55:00Z",
      "duration_minutes": 25,
      "message_count": 12
    }
  ]
}
```

---

#### GET `/api/history/:sessionId`
Get detailed information for a specific session.

**Example:**
```bash
GET /api/history/1
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": 1,
    "user_id": 456,
    "resume_id": 123,
    "resume_title": "Software Engineer Resume",
    "resume_file_name": "john_doe_resume.pdf",
    "job_title": "Senior Backend Engineer",
    "company_name": "Google",
    "job_description": "Full job description text...",
    "session_status": "completed",
    "total_questions": 5,
    "questions_answered": 5,
    "started_at": "2025-10-18T10:30:00Z",
    "completed_at": "2025-10-18T10:55:00Z",
    "duration_minutes": 25,
    "overall_feedback": { /* feedback object */ }
  },
  "messages": [
    {
      "id": 1,
      "role": "assistant",
      "content": "Tell me about a time when you faced a challenge...",
      "message_type": "ask_next_question",
      "question_number": 1,
      "question_type": "behavioral",
      "created_at": "2025-10-18T10:31:00Z"
    },
    {
      "id": 2,
      "role": "user",
      "content": "I once had to optimize a slow database query...",
      "message_type": "answer",
      "question_number": 1,
      "created_at": "2025-10-18T10:32:00Z"
    }
  ],
  "feedback": [
    {
      "id": 1,
      "question_number": 1,
      "question_text": "Tell me about a time...",
      "question_type": "behavioral",
      "user_answer": "I once had to...",
      "feedback_text": "Great use of the STAR method...",
      "strengths": ["Specific metrics", "Clear structure"],
      "areas_for_improvement": ["Could add more technical details"],
      "score": 8,
      "created_at": "2025-10-18T10:33:00Z"
    }
  ]
}
```

---

#### GET `/api/history/:sessionId/conversation`
Get conversation history as formatted text.

**Query Parameters:**
- `limit` (optional) - Limit number of messages

**Example:**
```bash
GET /api/history/1/conversation?limit=10
```

**Response:**
```json
{
  "success": true,
  "sessionId": 1,
  "conversation": "Assistant: Tell me about a time when you faced a challenge...\n\nUser: I once had to optimize a slow database query...\n\nAssistant: That's a great example..."
}
```

---

#### GET `/api/history/stats/summary`
Get user statistics and performance metrics.

**Example:**
```bash
GET /api/history/stats/summary
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_sessions": 15,
    "completed_sessions": 12,
    "resumes_practiced": 3,
    "job_descriptions_used": 5,
    "total_questions": 75,
    "total_answers": 70,
    "avg_duration_minutes": 25.5,
    "avg_score": 7.8
  }
}
```

---

#### GET `/api/history/job-descriptions/all`
Get all saved job descriptions for the user.

**Response:**
```json
{
  "success": true,
  "count": 3,
  "jobDescriptions": [
    {
      "id": 1,
      "title": "Senior Backend Engineer",
      "company_name": "Google",
      "description": "Full job description...",
      "created_at": "2025-10-18T10:00:00Z"
    }
  ]
}
```

---

#### POST `/api/history/job-descriptions`
Manually save a job description (for future UI).

**Request Body:**
```json
{
  "description": "Full job description text...",
  "title": "Senior Frontend Engineer",
  "company_name": "Meta"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Job description saved successfully",
  "jobDescriptionId": 5
}
```

---

## 🔄 How It Works

### Session Flow

1. **User starts interview** (`action: "start"`)
   - PostgreSQL session created
   - Links to resume + job description
   - Status: `in_progress`

2. **User answers questions**
   - Each message saved to Redis (fast cache)
   - Each message also saved to PostgreSQL (permanent)
   - Metadata tracked (question numbers, types, etc.)

3. **Interview completes** (final feedback received)
   - Session marked as `completed`
   - Duration auto-calculated
   - Overall feedback stored

4. **Redis session expires** (30 min TTL)
   - Active session removed from Redis
   - Complete history remains in PostgreSQL

### Resume + Job Description Mapping

- **One resume** can be used in **multiple sessions**
- **One job description** can be used in **multiple sessions**
- Same resume + different jobs = separate sessions
- Different resume + same job = separate sessions
- Automatic deduplication of job descriptions

---

## 💡 Key Features

### ✅ Automatic Session Management
- Reuses `in_progress` sessions for same resume + job combo
- Creates new session when starting fresh interview
- Auto-completes when final feedback received

### ✅ Smart Job Description Handling
- Saves unique job descriptions only
- Reuses existing if duplicate detected
- Supports manual job description management (future UI)

### ✅ Complete Message Tracking
- Every user message saved
- Every AI response saved
- Function calls and results tracked
- Question metadata preserved

### ✅ Performance Optimization
- Synchronous saves (guaranteed data integrity)
- Indexed queries for fast retrieval
- Session ownership verification

---

## 🧪 Testing

### Test the Chat Integration

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "job_description": "Senior Software Engineer at Google",
    "job_title": "Senior Software Engineer",
    "company_name": "Google"
  }'
```

### Test History Retrieval

```bash
# Get all sessions
curl -X GET http://localhost:5000/api/history \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific session
curl -X GET http://localhost:5000/api/history/1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get user stats
curl -X GET http://localhost:5000/api/history/stats/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔍 Troubleshooting

### Migration Issues

**Problem:** Migration fails with "relation already exists"
**Solution:** Some tables may already exist. Review and modify migration or drop existing tables.

### No History Showing

**Problem:** Chat works but no history in database
**Solution:** 
1. Check if migration ran successfully
2. Verify PostgreSQL connection
3. Check server logs for save errors

### Wrong User ID

**Problem:** Getting 403 errors when accessing sessions
**Solution:** Ensure `req.userProfile.id` is being set correctly by auth middleware

---

## 📝 Notes

### Why Two IDs (Firebase UID vs User Profile ID)?

- **Firebase UID** (string): External auth identifier
- **User Profile ID** (number): Internal database primary key
- Database foreign keys use numeric IDs for efficiency
- Auth uses Firebase UID for verification
- Middleware converts Firebase UID → User Profile ID

### Error Handling

- **Option A** (current): Fails if PostgreSQL save fails (data integrity)
- Can be changed to graceful degradation if needed
- All errors logged for monitoring

### Extensibility

- Job description management endpoint ready for future UI
- Can add update/delete endpoints as needed
- Schema supports additional metadata fields

---

## 🎯 Next Steps

1. ✅ Run migration
2. ✅ Test chat endpoints with new fields
3. ✅ Test history retrieval endpoints
4. 📱 Update frontend to display history
5. 📊 Build analytics dashboard
6. 🎨 Add job description management UI

---

## Questions?

The implementation follows all your requirements:
- ✅ Uses `userProfile.id` (database ID)
- ✅ Reuses in_progress sessions (Option C)
- ✅ Saves unique job descriptions (Option B with Option C extensibility)
- ✅ Uses primary resume if not specified (Option A)
- ✅ Synchronous saves (Option A)
- ✅ Auto-completes on final feedback (Option A)
- ✅ Fails on PostgreSQL errors (Option A)
- ✅ Updates both streaming and non-streaming (Option B)

Everything is ready to use! 🚀
