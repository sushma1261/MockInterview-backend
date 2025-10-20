# Session Resume API Documentation

## Overview

This API allows you to resume an **in-progress** interview session from PostgreSQL, restoring the conversation history to Redis. This is useful when:

- Redis session expires (1 hour TTL) but interview is not completed
- User wants to continue on a different device/browser
- Application restarts and Redis cache is cleared
- User explicitly wants to continue a previous in-progress session

## How It Works

### Current `/chat` Behavior

The existing `/chat` and `/chat/stream` endpoints **already automatically continue active sessions**:

1. When you call `/chat` without `action: "start"`, it looks for an active PostgreSQL session
2. If found, uses that session's `resume_id` and job description
3. Retrieves Redis conversation history if available
4. **Problem**: If Redis expires but PostgreSQL session is still `in_progress`, the conversation context is lost

### New Resume Endpoint

The new `POST /api/chat/resume/:sessionId` endpoint explicitly restores a session:

1. Fetches session details from PostgreSQL
2. Verifies ownership and status (must be `in_progress`)
3. Retrieves all chat messages from PostgreSQL
4. Clears any existing Redis session for the user
5. Restores all messages to Redis conversation history
6. Restores job description if exists
7. Caches resume context
8. **User can then call `/chat` normally to continue**

---

## API Endpoints

### 1. Resume Session

**Endpoint**: `POST /api/chat/resume/:sessionId`

**Authentication**: Required (Firebase token)

**Description**: Restore an in-progress session from PostgreSQL to Redis

**URL Parameters**:
- `sessionId` (number, required) - The ID of the session to resume

**Response**:
```json
{
  "success": true,
  "message": "Session 7 resumed successfully. You can now continue the conversation.",
  "session": {
    "id": 7,
    "resume_id": 5,
    "job_description_id": 3,
    "status": "in_progress",
    "started_at": "2025-10-19T10:30:00Z",
    "total_questions": 5,
    "questions_answered": 2
  },
  "messageCount": 5
}
```

**Error Responses**:

```json
// Session not found
{
  "error": "Failed to resume session",
  "details": "Session 999 not found"
}

// Not your session
{
  "error": "Failed to resume session",
  "details": "You don't have access to this session"
}

// Session already completed
{
  "error": "Failed to resume session",
  "details": "Cannot resume session with status: completed. Only in_progress sessions can be resumed."
}
```

**Example Usage**:
```bash
curl -X POST https://your-api.com/api/chat/resume/7 \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json"
```

---

### 2. Get In-Progress Sessions

**Endpoint**: `GET /api/history?status=in_progress`

**Authentication**: Required

**Description**: List all your in-progress sessions to find sessions you can resume

**Query Parameters**:
- `status=in_progress` - Filter for resumable sessions
- `limit=10` (optional) - Limit number of results

**Response**:
```json
{
  "success": true,
  "count": 2,
  "sessions": [
    {
      "id": 7,
      "resume_id": 5,
      "job_description_id": 3,
      "session_status": "in_progress",
      "started_at": "2025-10-19T10:30:00Z",
      "total_questions": 5,
      "questions_answered": 2,
      "job_title": "Senior Software Engineer",
      "company_name": "Acme Corp"
    },
    {
      "id": 5,
      "resume_id": 5,
      "job_description_id": null,
      "session_status": "in_progress",
      "started_at": "2025-10-18T14:20:00Z",
      "total_questions": 5,
      "questions_answered": 1
    }
  ]
}
```

**Example Usage**:
```bash
curl https://your-api.com/api/history?status=in_progress \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

---

### 3. Get Session Details

**Endpoint**: `GET /api/history/:sessionId`

**Authentication**: Required

**Description**: Get full details of a specific session including all messages

**Response**:
```json
{
  "success": true,
  "session": {
    "id": 7,
    "user_id": 1,
    "resume_id": 5,
    "job_description_id": 3,
    "session_status": "in_progress",
    "started_at": "2025-10-19T10:30:00Z",
    "total_questions": 5,
    "questions_answered": 2,
    "job_description": "We are looking for a Senior Software Engineer...",
    "job_title": "Senior Software Engineer",
    "company_name": "Acme Corp"
  },
  "messages": [
    {
      "id": 1,
      "session_id": 7,
      "role": "assistant",
      "content": "Tell me about your experience with microservices architecture.",
      "message_type": "start_interview",
      "question_number": 1,
      "created_at": "2025-10-19T10:30:05Z"
    },
    {
      "id": 2,
      "session_id": 7,
      "role": "user",
      "content": "I have 5 years of experience building microservices...",
      "message_type": "answer",
      "question_number": 1,
      "created_at": "2025-10-19T10:31:20Z"
    },
    // ... more messages
  ],
  "feedback": []
}
```

---

## Complete Workflow

### Scenario: Resume After Redis Expires

**Step 1**: Find your in-progress sessions
```bash
GET /api/history?status=in_progress
```

**Step 2**: Resume the desired session
```bash
POST /api/chat/resume/7
```

**Step 3**: Continue the conversation normally
```bash
POST /api/chat
{
  "message": "I implemented a service mesh using Istio..."
}
```

The session context is now restored, and the AI will continue from where you left off!

---

### Scenario: Continue Using Existing `/chat`

If you already have an active session in PostgreSQL and Redis hasn't expired yet, you can just use `/chat` directly:

```bash
POST /api/chat
{
  "message": "My answer to the previous question is..."
}
```

The system will:
1. Detect you have an active PostgreSQL session
2. Use that session's `resume_id` and job description
3. Continue with the existing Redis conversation history

**No need to call `/resume` if Redis is still active!**

---

## When to Use Each Endpoint

| Situation | Endpoint | Why |
|-----------|----------|-----|
| Starting new interview | `POST /chat` with `action: "start"` | Creates new session |
| Continuing active chat (Redis alive) | `POST /chat` | Auto-continues from Redis |
| Redis expired but session in_progress | `POST /chat/resume/:id` | Restores from PostgreSQL |
| Different device/browser | `POST /chat/resume/:id` | Loads session context |
| Check what sessions exist | `GET /api/history?status=in_progress` | List resumable sessions |
| View session details | `GET /api/history/:id` | See all messages |

---

## Technical Details

### Session States

- `in_progress` - Session can be resumed
- `completed` - Session finished, cannot resume (view only)
- `abandoned` - Not currently used

### Data Flow

1. **Resume Session**:
   - PostgreSQL → Get session metadata and all messages
   - Redis ← Store messages in conversation history
   - Cache ← Resume context and job description

2. **Continue Chat**:
   - Redis → Read conversation history
   - PostgreSQL → Track session progress
   - GenAI → Generate response with full context

### Redis TTLs

- Conversation history: 1 hour
- Chat session: 30 minutes
- After expiry, use `/resume` to restore from PostgreSQL

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Session X not found" | Invalid session ID | Check `/api/history` for valid IDs |
| "Access denied" | Session belongs to another user | Can only resume your own sessions |
| "Cannot resume completed session" | Session already finished | Start a new session instead |
| "No user profile" | Missing authentication | Include valid Firebase token |

---

## Frontend Integration Examples

### React Example

```typescript
// 1. Fetch in-progress sessions
const getResumableSessions = async () => {
  const response = await fetch('/api/history?status=in_progress', {
    headers: {
      'Authorization': `Bearer ${firebaseToken}`
    }
  });
  const data = await response.json();
  return data.sessions;
};

// 2. Resume a session
const resumeSession = async (sessionId: number) => {
  const response = await fetch(`/api/chat/resume/${sessionId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  console.log(`Restored ${data.messageCount} messages`);
  return data;
};

// 3. Continue chatting
const continueChat = async (message: string) => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
  return response.json();
};

// Usage
const sessions = await getResumableSessions();
await resumeSession(sessions[0].id);
await continueChat("Let me continue my answer...");
```

### UI Component Ideas

```typescript
// Session selection dialog
<Dialog>
  <h2>Resume Interview</h2>
  {inProgressSessions.map(session => (
    <Card key={session.id}>
      <h3>{session.job_title || 'General Interview'}</h3>
      <p>Started: {new Date(session.started_at).toLocaleString()}</p>
      <p>Progress: {session.questions_answered}/{session.total_questions} questions</p>
      <Button onClick={() => resumeSession(session.id)}>
        Resume
      </Button>
    </Card>
  ))}
</Dialog>
```

---

## Testing

### Test Resuming a Session

```bash
# 1. Start an interview
curl -X POST https://api.example.com/api/chat \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "message": "",
    "job_description": "Senior Developer role"
  }'

# 2. Answer a question
curl -X POST https://api.example.com/api/chat \
  -H "Authorization: Bearer TOKEN" \
  -d '{"message": "I have 5 years of experience..."}'

# 3. Get session ID
curl https://api.example.com/api/history?status=in_progress \
  -H "Authorization: Bearer TOKEN"
# Response: { "sessions": [{ "id": 7, ... }] }

# 4. Simulate Redis expiry (wait or restart Docker)
docker compose restart backend

# 5. Resume the session
curl -X POST https://api.example.com/api/chat/resume/7 \
  -H "Authorization: Bearer TOKEN"

# 6. Continue chatting
curl -X POST https://api.example.com/api/chat \
  -H "Authorization: Bearer TOKEN" \
  -d '{"message": "Continuing my answer..."}'
```

### Verify Messages Restored

```sql
-- Check session exists
SELECT * FROM interview_sessions WHERE id = 7;

-- Check messages were saved
SELECT role, LEFT(content, 50), message_type, created_at 
FROM chat_messages 
WHERE session_id = 7 
ORDER BY created_at;
```

---

## Summary

✅ **Use `/chat`** for normal conversation (auto-continues active sessions)  
✅ **Use `/chat/resume/:id`** to explicitly restore expired or cross-device sessions  
✅ **Use `/history?status=in_progress`** to find sessions you can resume  
✅ All messages are safely stored in PostgreSQL, even if Redis expires  
✅ Session restoration is seamless - AI has full conversation context  

