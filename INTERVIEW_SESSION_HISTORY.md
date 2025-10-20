# Interview Session History - PostgreSQL Implementation

## Overview

This implementation adds **persistent interview session history** to PostgreSQL, tracking:
- ✅ Complete chat conversations
- ✅ Resume and job description mapping
- ✅ Session metadata (status, timing, scores)
- ✅ Detailed question feedback
- ✅ Multi-resume, multi-job description support

## Database Schema

### Tables Created

#### 1. `job_descriptions`
Stores reusable job descriptions.

```sql
- id (PK)
- user_id (FK → user_profiles)
- title (e.g., "Senior Software Engineer")
- company_name
- description (full job description text)
- requirements
- created_at, updated_at
```

**Key Feature**: Same job description can be used with multiple resumes.

---

#### 2. `interview_sessions`
Tracks each interview practice session.

```sql
- id (PK)
- user_id (FK → user_profiles)
- resume_id (FK → resumes)
- job_description_id (FK → job_descriptions, nullable)
- session_status ('in_progress', 'completed', 'abandoned')
- total_questions
- questions_answered
- started_at
- completed_at
- duration_minutes (auto-calculated)
- overall_feedback (JSONB)
- created_at, updated_at
```

**Key Feature**: Maps resume + job description + conversation history uniquely.

---

#### 3. `chat_messages`
Stores complete conversation history.

```sql
- id (PK)
- session_id (FK → interview_sessions)
- role ('user' or 'assistant')
- content (message text)
- message_type ('question', 'answer', 'feedback', 'function_call')
- question_number
- question_type ('behavioral', 'technical', 'situational')
- function_name (if AI made a function call)
- function_result (JSONB)
- created_at
```

**Key Feature**: Complete chat history with metadata for replaying conversations.

---

#### 4. `question_feedback`
Stores detailed feedback for each question.

```sql
- id (PK)
- session_id (FK → interview_sessions)
- question_number
- question_text
- question_type
- user_answer
- feedback_text
- strengths (text array)
- areas_for_improvement (text array)
- score (0-10)
- created_at
```

**Key Feature**: Structured feedback for analytics and improvement tracking.

---

### Relationships

```
user_profiles (1) ──→ (many) resumes
user_profiles (1) ──→ (many) job_descriptions
user_profiles (1) ──→ (many) interview_sessions

resumes (1) ──→ (many) interview_sessions
job_descriptions (1) ──→ (many) interview_sessions

interview_sessions (1) ──→ (many) chat_messages
interview_sessions (1) ──→ (many) question_feedback
```

**Many-to-Many Support**:
- ✅ One resume can be used in multiple sessions
- ✅ One job description can be used in multiple sessions
- ✅ One resume can be practiced with multiple job descriptions
- ✅ One job description can be practiced with multiple resumes

---

## Service API

### `InterviewSessionService`

#### Job Descriptions

```typescript
// Save or get existing job description
const jobDescId = await sessionService.saveJobDescription(
  userId,
  "Full job description text...",
  "Senior Backend Engineer",
  "Google"
);

// Get all job descriptions for user
const jobDescs = await sessionService.getUserJobDescriptions(userId);
```

#### Sessions

```typescript
// Create new session
const sessionId = await sessionService.createSession(
  userId,
  resumeId,
  jobDescriptionId // optional
);

// Get or reuse active session
const sessionId = await sessionService.getOrCreateSession(
  userId,
  resumeId,
  jobDescriptionId
);

// Update session
await sessionService.updateSession(sessionId, {
  status: 'completed',
  totalQuestions: 5,
  questionsAnswered: 5,
  overallFeedback: { /* feedback object */ }
});

// Mark as completed
await sessionService.completeSession(sessionId, overallFeedback);

// Get session details
const session = await sessionService.getSession(sessionId);

// Get user's sessions
const sessions = await sessionService.getUserSessions(userId, {
  resumeId: 123,        // optional filter
  status: 'completed',  // optional filter
  limit: 10             // optional limit
});
```

#### Chat Messages

```typescript
// Save a message
await sessionService.saveMessage(
  sessionId,
  'user',
  'Tell me about a time you faced a challenge...',
  {
    messageType: 'answer',
    questionNumber: 2,
    questionType: 'behavioral'
  }
);

// Get all messages
const messages = await sessionService.getSessionMessages(sessionId);

// Get formatted conversation history
const history = await sessionService.getConversationHistory(sessionId, 10);
```

#### Question Feedback

```typescript
// Save feedback for a question
await sessionService.saveFeedback(
  sessionId,
  questionNumber,
  questionText,
  userAnswer,
  {
    feedbackText: 'Great answer with specific examples...',
    strengths: ['Used STAR method', 'Specific metrics'],
    areasForImprovement: ['Could add more technical details'],
    score: 8,
    questionType: 'behavioral'
  }
);

// Get all feedback for session
const feedback = await sessionService.getSessionFeedback(sessionId);
```

#### Statistics

```typescript
// Get user statistics
const stats = await sessionService.getUserStats(userId);
/* Returns:
{
  total_sessions: 15,
  completed_sessions: 12,
  resumes_practiced: 3,
  job_descriptions_used: 5,
  total_questions: 75,
  total_answers: 70,
  avg_duration_minutes: 25.5,
  avg_score: 7.8
}
*/
```

---

## Integration Guide

### Step 1: Run Migration

```bash
# Run the migration
psql -U your_user -d your_database -f src/db/migrations/004_interview_sessions.sql
```

Or use your migration tool:

```typescript
import { pool } from './db/pool';
import fs from 'fs';

const migration = fs.readFileSync(
  'src/db/migrations/004_interview_sessions.sql',
  'utf8'
);
await pool.query(migration);
```

---

### Step 2: Update `InterviewController`

Add session tracking to your interview flow:

```typescript
import { InterviewSessionService } from '../services/InterviewSessionService';

export class InterviewController {
  private sessionService: InterviewSessionService;
  
  constructor(pool: Pool, redis: Redis) {
    // ... existing services
    this.sessionService = InterviewSessionService.getInstance(pool);
  }

  async processChat(userId: string, request: ChatRequest): Promise<ChatResponse> {
    // Get userId as number (from user_profiles)
    const userIdNum = await this.getUserIdFromFirebaseUid(userId);
    
    // Save job description if provided
    let jobDescId: number | undefined;
    if (request.job_description) {
      jobDescId = await this.sessionService.saveJobDescription(
        userIdNum,
        request.job_description,
        request.job_title,
        request.company_name
      );
    }
    
    // Get or create session
    const sessionId = await this.sessionService.getOrCreateSession(
      userIdNum,
      request.resume_id,
      jobDescId
    );
    
    // ... existing chat processing
    
    // Save user message
    if (message) {
      await this.sessionService.saveMessage(
        sessionId,
        'user',
        message,
        {
          messageType: 'answer',
          questionNumber: request.question_number
        }
      );
    }
    
    // ... get AI response
    
    // Save assistant message
    if (streamResult.fullText) {
      await this.sessionService.saveMessage(
        sessionId,
        'assistant',
        streamResult.fullText,
        {
          messageType: streamResult.functionCallResult?.type || 'text',
          questionNumber: streamResult.functionCallResult?.question_number,
          questionType: streamResult.functionCallResult?.question_type,
          functionName: streamResult.functionCallResult?.type,
          functionResult: streamResult.functionCallResult
        }
      );
    }
    
    // If interview completed
    if (streamResult.functionCallResult?.type === 'generate_feedback' && 
        streamResult.functionCallResult.is_final) {
      await this.sessionService.completeSession(
        sessionId,
        streamResult.functionCallResult
      );
    }
    
    return response;
  }
}
```

---

### Step 3: Add History API Endpoints

Create routes to display chat history:

```typescript
// routes/history.route.ts
import { Router } from 'express';
import { InterviewSessionService } from '../services/InterviewSessionService';

const router = Router();
const sessionService = InterviewSessionService.getInstance();

// Get all sessions for user
router.get('/', async (req, res) => {
  const userId = req.user.id; // from auth middleware
  const sessions = await sessionService.getUserSessions(userId);
  res.json(sessions);
});

// Get specific session with full chat history
router.get('/:sessionId', async (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  const session = await sessionService.getSession(sessionId);
  const messages = await sessionService.getSessionMessages(sessionId);
  const feedback = await sessionService.getSessionFeedback(sessionId);
  
  res.json({
    session,
    messages,
    feedback
  });
});

// Get user statistics
router.get('/stats/summary', async (req, res) => {
  const userId = req.user.id;
  const stats = await sessionService.getUserStats(userId);
  res.json(stats);
});

export default router;
```

---

## Features Enabled

### ✅ Complete History Tracking
- Every message saved to PostgreSQL
- Full conversation replay available
- Resume and job description context preserved

### ✅ Multi-Resume Support
- User can practice with multiple resumes
- Each resume tracked separately
- Easy filtering by resume_id

### ✅ Multi-Job Description Support
- Reuse job descriptions across interviews
- Practice same resume with different jobs
- Practice different resumes with same job

### ✅ Analytics & Insights
- Track improvement over time
- Average scores by question type
- Session duration tracking
- Completion rates

### ✅ Session Management
- Resume interrupted sessions
- Mark sessions as completed/abandoned
- Auto-calculate session duration

---

## Example Queries

### Get all completed sessions for a resume

```sql
SELECT 
  s.id,
  s.started_at,
  s.duration_minutes,
  jd.title AS job_title,
  COUNT(cm.id) AS message_count,
  AVG(qf.score) AS avg_score
FROM interview_sessions s
LEFT JOIN job_descriptions jd ON s.job_description_id = jd.id
LEFT JOIN chat_messages cm ON s.id = cm.session_id
LEFT JOIN question_feedback qf ON s.id = qf.session_id
WHERE s.resume_id = 123
  AND s.session_status = 'completed'
GROUP BY s.id, jd.title;
```

### Get conversation history for session

```sql
SELECT 
  role,
  content,
  message_type,
  question_number,
  created_at
FROM chat_messages
WHERE session_id = 456
ORDER BY created_at ASC;
```

### Get user's performance trends

```sql
SELECT 
  DATE(s.started_at) AS practice_date,
  COUNT(s.id) AS sessions,
  AVG(qf.score) AS avg_score,
  SUM(s.questions_answered) AS total_questions
FROM interview_sessions s
LEFT JOIN question_feedback qf ON s.id = qf.session_id
WHERE s.user_id = 789
  AND s.session_status = 'completed'
GROUP BY DATE(s.started_at)
ORDER BY practice_date DESC;
```

---

## Benefits Over Redis-Only Approach

| Feature | Redis Only | PostgreSQL + Redis |
|---------|------------|-------------------|
| **Persistence** | Temporary (TTL) | Permanent |
| **History** | Recent sessions only | Complete history |
| **Analytics** | Limited | Full analytics |
| **Search** | Basic | Complex queries |
| **Relationships** | Manual | Foreign keys |
| **Data Integrity** | Manual | ACID transactions |
| **Backup** | Snapshot | Standard backups |

---

## Migration from Redis to PostgreSQL

You can run both in parallel:

1. **Redis**: Fast cache for active sessions (30 min TTL)
2. **PostgreSQL**: Permanent storage for all history

**Flow**:
```
User sends message
  ↓
Save to Redis (for active session)
  ↓
Save to PostgreSQL (for history)
  ↓
Session expires in Redis (30 min)
  ↓
History still in PostgreSQL forever
```

---

## Next Steps

1. ✅ Run the migration: `004_interview_sessions.sql`
2. ✅ Integrate `InterviewSessionService` into `InterviewController`
3. ✅ Add history API endpoints
4. ✅ Update frontend to display chat history
5. ✅ Add analytics dashboard using session statistics

---

## Questions?

This implementation provides:
- ✅ Complete chat history persistence
- ✅ Resume-to-job-description mapping
- ✅ Support for multiple resumes and job descriptions
- ✅ Analytics and performance tracking
- ✅ Easy querying and reporting

The schema is fully normalized and supports all your requirements!
