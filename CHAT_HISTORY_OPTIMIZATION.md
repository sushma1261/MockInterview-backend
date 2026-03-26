# Chat History Optimization

## Problem Identified

Previously, the application was **double-counting tokens** by:
1. Sending conversation history in every prompt text
2. While the GenAI SDK was ALREADY maintaining history internally in the chat object

This resulted in:
- **2x token usage** for context (both manual history + SDK's internal history)
- Input tokens growing with each turn (capped at ~10 messages but still duplicated)
- Unnecessary API costs

## Solution Implemented

### Smart History Injection
The optimization now tracks which sessions need history seeding:

1. **New Sessions**: No history needed (fresh start)
   - Flag: `needsHistorySeed = false`
   
2. **Active Sessions**: No history injection (SDK maintains context)
   - Flag: `needsHistorySeed = false`
   - Logs: `⚡ Skipping history fetch - SDK maintains context`
   
3. **Reconstructed Sessions** (after server restart): History injected ONCE
   - Flag: `needsHistorySeed = true`
   - Logs: `📜 Fetching history for reconstructed session`
   - After first turn: `✅ History seeded - SDK will maintain context from now`

### Key Changes

#### ChatSessionManager.ts
- Added `sessionNeedsHistorySeed: Map<string, boolean>` to track seeding state
- New sessions: Set flag to `false`
- Reconstructed sessions: Set flag to `true`
- Added methods:
  - `needsHistorySeed(userId)`: Check if history injection needed
  - `markHistorySeeded(userId)`: Mark after first turn with history

#### InterviewControllers.ts
- Check `needsHistorySeed` before fetching conversation history
- Only fetch history from Redis when needed
- Call `markHistorySeeded` after first AI response
- Empty string for `conversationHistory` when SDK has context

## Benefits

### Token Savings
| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| Turn 1 | ~100 tokens | ~100 tokens | 0% |
| Turn 2 | ~300 tokens (100 new + 200 dup) | ~100 tokens | **67%** |
| Turn 3 | ~500 tokens (100 new + 400 dup) | ~100 tokens | **80%** |
| Turn 10+ | ~1100 tokens (100 new + 1000 dup) | ~100 tokens | **91%** |

### Cost Impact
- **Active sessions**: ~70-90% reduction in input tokens after first turn
- **Reconstructed sessions**: One-time history cost, then same savings
- For 10-turn interview: ~$0.50 → ~$0.15 per session (example pricing)

## How It Works

```typescript
// Check if session needs history
const needsHistory = this.chatSessionManager.needsHistorySeed(userId);

if (needsHistory) {
  // Reconstructed session - send history once
  conversationHistory = await this.conversationStore.fetchContext(userId, "interview", 10);
} else {
  // Active session - SDK already has context
  conversationHistory = "";
}

// After AI responds
if (needsHistory) {
  this.chatSessionManager.markHistorySeeded(userId);
}
```

## Persistence Still Works

Redis storage continues to:
- Store all messages for analytics
- Enable session reconstruction after restart  
- Support conversation export/review
- Track turn counts and metadata

History is still saved to Redis but only fetched when reconstructing a session.

## Monitoring

Watch for these logs:
- `⚡ Skipping history fetch - SDK maintains context` = Optimization working
- `📜 Fetching history for reconstructed session` = One-time seeding
- `✅ History seeded - SDK will maintain context from now` = Seeding complete

## Migration Notes

- **No breaking changes** - API contracts unchanged
- **No data migration needed** - Uses existing Redis structure
- **Backward compatible** - Existing sessions gracefully handled
- **Test after deployment** - Verify token usage in GenAI dashboard

## Future Optimizations

Consider:
1. Dynamic history window based on token budget
2. Semantic compression for long conversations
3. Summary-based context instead of full history
4. Token usage tracking per session
