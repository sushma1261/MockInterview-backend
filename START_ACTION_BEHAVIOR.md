# Start Action Behavior - Session Handling

## Overview

When a user sends `action: "start"` or `action: "restart"`, the system now **automatically closes any existing in-progress session** and creates a fresh new session.

## Previous Behavior ❌

Before this change:
```bash
# User starts interview
POST /api/chat { "action": "start" }
# Creates session ID: 1 (status: in_progress)

# User answers some questions...
POST /api/chat { "message": "My answer..." }

# User starts ANOTHER interview (maybe forgot about the first one)
POST /api/chat { "action": "start" }
# PROBLEM: Would reuse session ID: 1 (confusing!)
```

**Issue**: The old in-progress session would be reused, mixing questions from different interview attempts.

---

## New Behavior ✅

After this change:
```bash
# User starts interview
POST /api/chat { "action": "start" }
# Creates session ID: 1 (status: in_progress)

# User answers some questions...
POST /api/chat { "message": "My answer..." }

# User starts ANOTHER interview
POST /api/chat { "action": "start" }
# ✅ Session 1 marked as "abandoned"
# ✅ Creates NEW session ID: 2 (status: in_progress)
```

**Benefit**: Each `start` action creates a clean slate, preventing confusion.

---

## Implementation Details

### Code Changes

In `InterviewControllers.ts`, the `getOrCreatePgSession()` method now:

1. **Checks if action is START or RESTART**
2. **Finds any existing in-progress session** for the user
3. **Marks it as "abandoned"** (preserves data for history)
4. **Creates a new session**

```typescript
private async getOrCreatePgSession(
  userProfileId: number,
  resumeId: number,
  action?: string,
  jobDescription?: string,
  jobTitle?: string,
  companyName?: string
): Promise<number> {
  // If action is START, close any existing in-progress session
  if (action === InterviewAction.START || action === InterviewAction.RESTART) {
    const activeSession = await this.sessionService.getActiveSession(userProfileId);
    if (activeSession) {
      console.log(`🔚 Completing existing session ${activeSession.id} before starting new one`);
      await this.sessionService.updateSession(activeSession.id, {
        status: "abandoned",
      });
    }
  }
  
  // Continue with normal session creation...
}
```

### Session Statuses

| Status | Meaning |
|--------|---------|
| `in_progress` | Active interview session (only ONE per user) |
| `completed` | User finished the interview and received feedback |
| `abandoned` | User started a new interview without completing this one |

### Logs

When starting a new interview while one is in progress:

```
🔚 Completing existing session 7 before starting new one
📝 Created interview session 8 for user 1, resume 5
📊 Using PostgreSQL session 8 for tracking
```

---

## Use Cases

### Use Case 1: User Restarts Accidentally

**Scenario**: User is in middle of interview, accidentally clicks "Start New Interview"

```bash
POST /api/chat { "action": "start" }
```

**Result**:
- Old session (ID: 7) → status: `abandoned` (preserves history)
- New session (ID: 8) → status: `in_progress`
- User gets fresh start

**Recovery**: User can view abandoned session in history:
```bash
GET /api/history/7  # View incomplete interview
```

### Use Case 2: User Wants Fresh Start

**Scenario**: User unhappy with answers, wants to restart

```bash
# Original interview
POST /api/chat { "action": "start" }  # Session 1
POST /api/chat { "message": "Bad answer..." }

# Start over
POST /api/chat { "action": "start" }  # Session 2 (fresh)
```

**Result**: Clean slate, no history from session 1 in the new interview.

### Use Case 3: Different Job Descriptions

**Scenario**: User wants to practice for different positions

```bash
# Interview for Job A
POST /api/chat { 
  "action": "start",
  "job_description": "Frontend Engineer role..."
}  # Session 1

# Later: Interview for Job B (without finishing Job A)
POST /api/chat {
  "action": "start", 
  "job_description": "Backend Engineer role..."
}  # Session 2

# Session 1 marked abandoned, Session 2 is active
```

**Result**: Each job description gets its own session, no cross-contamination.

---

## Continue vs Start

### `action: "continue"` or no action

```bash
POST /api/chat { "message": "My answer..." }
```
- ✅ Reuses existing `in_progress` session
- ✅ Continues conversation context
- ✅ Appends to history

### `action: "start"`

```bash
POST /api/chat { "action": "start" }
```
- ⚠️ Abandons existing `in_progress` session if any
- ✅ Creates NEW session
- ✅ Fresh conversation (no history from previous session)

---

## Testing

### Test 1: Start → Continue → Start (New Session)

```bash
# Step 1: Start interview
curl -X POST https://api.example.com/api/chat \
  -H "Authorization: Bearer TOKEN" \
  -d '{"action": "start"}'
# Response: { "sessionId": 1, ... }

# Step 2: Answer question
curl -X POST https://api.example.com/api/chat \
  -H "Authorization: Bearer TOKEN" \
  -d '{"message": "I have experience with React..."}'

# Step 3: Check active sessions
curl https://api.example.com/api/history?status=in_progress \
  -H "Authorization: Bearer TOKEN"
# Response: { "sessions": [{ "id": 1, "status": "in_progress" }] }

# Step 4: Start NEW interview
curl -X POST https://api.example.com/api/chat \
  -H "Authorization: Bearer TOKEN" \
  -d '{"action": "start"}'
# Response: { "sessionId": 2, ... }

# Step 5: Verify old session abandoned
curl https://api.example.com/api/history/1 \
  -H "Authorization: Bearer TOKEN"
# Response: { "session": { "id": 1, "session_status": "abandoned" } }

# Step 6: Verify new session active
curl https://api.example.com/api/history?status=in_progress \
  -H "Authorization: Bearer TOKEN"
# Response: { "sessions": [{ "id": 2, "status": "in_progress" }] }
```

### Test 2: SQL Verification

```sql
-- Check session statuses
SELECT id, session_status, started_at, completed_at 
FROM interview_sessions 
WHERE user_id = 1 
ORDER BY started_at DESC;

-- Expected result:
-- id: 2, status: in_progress, completed_at: NULL
-- id: 1, status: abandoned, completed_at: NULL
```

---

## Edge Cases

### What if no in-progress session exists?

**Scenario**: First interview or all previous interviews completed

```bash
POST /api/chat { "action": "start" }
```

**Result**: Simply creates new session (no abandonment needed). No errors.

### What if user has multiple browser tabs?

**Scenario**: Tab A has active interview, Tab B starts new one

**Result**: 
- Tab A's session gets abandoned
- Tab B gets new session
- Tab A will continue with old session ID (might cause confusion)
- **Recommendation**: Frontend should detect session changes and refresh

---

## Frontend Recommendations

### Show Warning Before Starting New Interview

```typescript
const handleStartInterview = async () => {
  // Check if there's an active session
  const response = await fetch('/api/history?status=in_progress');
  const { sessions } = await response.json();
  
  if (sessions.length > 0) {
    const confirmed = confirm(
      `You have an in-progress interview from ${new Date(sessions[0].started_at).toLocaleString()}. ` +
      `Starting a new interview will abandon the current one. Continue?`
    );
    
    if (!confirmed) return;
  }
  
  // Proceed with start
  await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ action: 'start' })
  });
};
```

### Resume vs Start Button

```tsx
<div>
  {hasInProgressSession ? (
    <>
      <Button onClick={resumeInterview}>Resume Interview</Button>
      <Button onClick={startNewInterview} variant="secondary">
        Start New (Abandon Current)
      </Button>
    </>
  ) : (
    <Button onClick={startNewInterview}>Start Interview</Button>
  )}
</div>
```

---

## Summary

✅ **`action: "start"`** now **always creates a new session**  
✅ **Old in-progress sessions** are marked as **`abandoned`** (preserved in history)  
✅ **One active session per user** at any time  
✅ **History preserved** - abandoned sessions can still be viewed  
✅ **Clean separation** - no mixing of different interview attempts  

This ensures predictable behavior and prevents confusion when users restart interviews.
