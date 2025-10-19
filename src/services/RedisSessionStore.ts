import { Redis } from "ioredis";

/**
 * Redis-based session storage with TTL and automatic expiration
 * Replaces in-memory storage for scalability and persistence
 */

// Session TTL configurations (in seconds)
export const SESSION_TTL = {
  CHAT_SESSION: 30 * 60, // 30 minutes
  CONVERSATION_HISTORY: 60 * 60, // 1 hour
  RESUME_CONTEXT: 60 * 60, // 1 hour
  JOB_DESCRIPTION: 24 * 60 * 60, // 24 hours
} as const;

// Redis key prefixes
export const KEY_PREFIX = {
  CHAT_SESSION: "chat:session:",
  CONVERSATION: "chat:conversation:",
  RESUME_CONTEXT: "chat:resume_context:",
  JOB_DESCRIPTION: "chat:job_desc:",
  SESSION_METADATA: "chat:metadata:",
} as const;

/**
 * Interface for chat session metadata
 */
interface SessionMetadata {
  userId: string;
  resumeId?: number;
  createdAt: number;
  lastAccessedAt: number;
  turnCount: number;
}

/**
 * Interface for conversation message
 */
interface ConversationMessage {
  role: "user" | "ai";
  content: string;
  timestamp: string;
  embedding?: number[];
}

/**
 * Manages Redis-based session storage with automatic expiration
 */
export class RedisSessionStore {
  private static instance: RedisSessionStore;
  private redis: Redis;

  private constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get singleton instance
   */
  public static getInstance(redis?: Redis): RedisSessionStore {
    if (!RedisSessionStore.instance) {
      if (!redis) {
        throw new Error("Redis client required for first getInstance call");
      }
      RedisSessionStore.instance = new RedisSessionStore(redis);
    }
    return RedisSessionStore.instance;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHAT SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Store chat session data (system prompt, history)
   */
  async saveChatSession(
    userId: string,
    sessionData: {
      systemPrompt: string;
      history: any[];
      resumeId?: number;
      jobDescription?: string;
    }
  ): Promise<void> {
    const key = `${KEY_PREFIX.CHAT_SESSION}${userId}`;
    const data = JSON.stringify(sessionData);

    await this.redis.setex(key, SESSION_TTL.CHAT_SESSION, data);

    // Update metadata
    await this.updateSessionMetadata(userId, sessionData.resumeId);

    console.log(
      `💾 Saved chat session for ${userId} (TTL: ${SESSION_TTL.CHAT_SESSION}s)`
    );
  }

  /**
   * Get chat session data
   */
  async getChatSession(userId: string): Promise<{
    systemPrompt: string;
    history: any[];
    resumeId?: number;
    jobDescription?: string;
  } | null> {
    const key = `${KEY_PREFIX.CHAT_SESSION}${userId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    // Refresh TTL on access
    await this.redis.expire(key, SESSION_TTL.CHAT_SESSION);
    await this.touchSession(userId);

    return JSON.parse(data);
  }

  /**
   * Delete chat session
   */
  async deleteChatSession(userId: string): Promise<void> {
    const key = `${KEY_PREFIX.CHAT_SESSION}${userId}`;
    await this.redis.del(key);
    await this.deleteSessionMetadata(userId);
    console.log(`🗑️  Deleted chat session for ${userId}`);
  }

  /**
   * Check if chat session exists
   */
  async hasChatSession(userId: string): Promise<boolean> {
    const key = `${KEY_PREFIX.CHAT_SESSION}${userId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONVERSATION HISTORY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add conversation message
   */
  async addConversationMessage(
    userId: string,
    message: ConversationMessage
  ): Promise<void> {
    const key = `${KEY_PREFIX.CONVERSATION}${userId}`;

    // Store as JSON in a list
    await this.redis.rpush(key, JSON.stringify(message));

    // Set TTL (will reset if key already exists)
    await this.redis.expire(key, SESSION_TTL.CONVERSATION_HISTORY);

    console.log(`💬 Added ${message.role} message for ${userId}`);
  }

  /**
   * Add conversation turn (user + AI)
   */
  async addConversationTurn(
    userId: string,
    userMessage: string,
    aiMessage: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    await this.addConversationMessage(userId, {
      role: "user",
      content: userMessage,
      timestamp,
    });

    await this.addConversationMessage(userId, {
      role: "ai",
      content: aiMessage,
      timestamp,
    });
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    userId: string,
    maxMessages: number = 50
  ): Promise<ConversationMessage[]> {
    const key = `${KEY_PREFIX.CONVERSATION}${userId}`;

    // Get last N messages
    const messages = await this.redis.lrange(key, -maxMessages, -1);

    if (messages.length > 0) {
      // Refresh TTL on access
      await this.redis.expire(key, SESSION_TTL.CONVERSATION_HISTORY);
    }

    return messages.map((msg) => JSON.parse(msg));
  }

  /**
   * Get conversation history as formatted string
   */
  async getConversationHistoryString(
    userId: string,
    maxMessages: number = 10
  ): Promise<string> {
    const messages = await this.getConversationHistory(userId, maxMessages);

    return messages
      .map((msg) => {
        const prefix = msg.role === "user" ? "Human:" : "AI:";
        return `${prefix} ${msg.content}`;
      })
      .join("\n");
  }

  /**
   * Get conversation turn count
   */
  async getConversationTurnCount(userId: string): Promise<number> {
    const key = `${KEY_PREFIX.CONVERSATION}${userId}`;
    const count = await this.redis.llen(key);
    return Math.floor(count / 2); // Divide by 2 for Q&A pairs
  }

  /**
   * Clear conversation history
   */
  async clearConversationHistory(userId: string): Promise<void> {
    const key = `${KEY_PREFIX.CONVERSATION}${userId}`;
    await this.redis.del(key);
    console.log(`🗑️  Cleared conversation history for ${userId}`);
  }

  /**
   * Trim conversation history to keep only recent messages
   */
  async trimConversationHistory(
    userId: string,
    keepLast: number = 50
  ): Promise<void> {
    const key = `${KEY_PREFIX.CONVERSATION}${userId}`;
    await this.redis.ltrim(key, -keepLast, -1);
    console.log(
      `✂️  Trimmed conversation history for ${userId} to ${keepLast}`
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RESUME CONTEXT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Save resume context chunks
   */
  async saveResumeContext(
    userId: string,
    resumeId: number,
    chunks: string[]
  ): Promise<void> {
    const key = `${KEY_PREFIX.RESUME_CONTEXT}${userId}:${resumeId}`;
    const data = JSON.stringify(chunks);

    await this.redis.setex(key, SESSION_TTL.RESUME_CONTEXT, data);

    console.log(
      `📄 Cached resume context for ${userId}, resume ${resumeId} (${chunks.length} chunks)`
    );
  }

  /**
   * Get resume context chunks
   */
  async getResumeContext(
    userId: string,
    resumeId: number
  ): Promise<string[] | null> {
    const key = `${KEY_PREFIX.RESUME_CONTEXT}${userId}:${resumeId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    // Refresh TTL on access
    await this.redis.expire(key, SESSION_TTL.RESUME_CONTEXT);

    return JSON.parse(data);
  }

  /**
   * Clear resume context cache for user
   */
  async clearResumeContext(userId: string): Promise<void> {
    const pattern = `${KEY_PREFIX.RESUME_CONTEXT}${userId}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
      console.log(
        `🗑️  Cleared ${keys.length} resume context caches for ${userId}`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // JOB DESCRIPTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Save job description
   */
  async saveJobDescription(
    userId: string,
    jobDescription: string
  ): Promise<void> {
    const key = `${KEY_PREFIX.JOB_DESCRIPTION}${userId}`;
    await this.redis.setex(key, SESSION_TTL.JOB_DESCRIPTION, jobDescription);
    console.log(`💼 Saved job description for ${userId}`);
  }

  /**
   * Get job description
   */
  async getJobDescription(userId: string): Promise<string | null> {
    const key = `${KEY_PREFIX.JOB_DESCRIPTION}${userId}`;
    return await this.redis.get(key);
  }

  /**
   * Clear job description
   */
  async clearJobDescription(userId: string): Promise<void> {
    const key = `${KEY_PREFIX.JOB_DESCRIPTION}${userId}`;
    await this.redis.del(key);
    console.log(`🗑️  Cleared job description for ${userId}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // SESSION METADATA MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Update session metadata
   */
  private async updateSessionMetadata(
    userId: string,
    resumeId?: number
  ): Promise<void> {
    const key = `${KEY_PREFIX.SESSION_METADATA}${userId}`;
    const now = Date.now();

    const existing = await this.redis.get(key);
    const metadata: SessionMetadata = existing
      ? JSON.parse(existing)
      : {
          userId,
          createdAt: now,
          lastAccessedAt: now,
          turnCount: 0,
        };

    metadata.lastAccessedAt = now;
    if (resumeId !== undefined) {
      metadata.resumeId = resumeId;
    }

    await this.redis.setex(
      key,
      SESSION_TTL.CHAT_SESSION,
      JSON.stringify(metadata)
    );
  }

  /**
   * Touch session (update last accessed time)
   */
  private async touchSession(userId: string): Promise<void> {
    const key = `${KEY_PREFIX.SESSION_METADATA}${userId}`;
    const data = await this.redis.get(key);

    if (data) {
      const metadata: SessionMetadata = JSON.parse(data);
      metadata.lastAccessedAt = Date.now();
      await this.redis.setex(
        key,
        SESSION_TTL.CHAT_SESSION,
        JSON.stringify(metadata)
      );
    }
  }

  /**
   * Get session metadata
   */
  async getSessionMetadata(userId: string): Promise<SessionMetadata | null> {
    const key = `${KEY_PREFIX.SESSION_METADATA}${userId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Delete session metadata
   */
  private async deleteSessionMetadata(userId: string): Promise<void> {
    const key = `${KEY_PREFIX.SESSION_METADATA}${userId}`;
    await this.redis.del(key);
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP AND MONITORING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Clear all session data for a user
   */
  async clearUserSession(userId: string): Promise<void> {
    await this.deleteChatSession(userId);
    await this.clearConversationHistory(userId);
    await this.clearResumeContext(userId);
    await this.clearJobDescription(userId);
    console.log(`🗑️  Cleared all session data for ${userId}`);
  }

  /**
   * Get all active session user IDs
   */
  async getActiveSessions(): Promise<string[]> {
    const pattern = `${KEY_PREFIX.CHAT_SESSION}*`;
    const keys = await this.redis.keys(pattern);

    return keys.map((key) => key.replace(KEY_PREFIX.CHAT_SESSION, ""));
  }

  /**
   * Get active session count
   */
  async getActiveSessionCount(): Promise<number> {
    const sessions = await this.getActiveSessions();
    return sessions.length;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    activeSessions: number;
    totalConversations: number;
    totalResumeContexts: number;
    totalJobDescriptions: number;
  }> {
    const [sessions, conversations, contexts, jobs] = await Promise.all([
      this.redis.keys(`${KEY_PREFIX.CHAT_SESSION}*`),
      this.redis.keys(`${KEY_PREFIX.CONVERSATION}*`),
      this.redis.keys(`${KEY_PREFIX.RESUME_CONTEXT}*`),
      this.redis.keys(`${KEY_PREFIX.JOB_DESCRIPTION}*`),
    ]);

    return {
      activeSessions: sessions.length,
      totalConversations: conversations.length,
      totalResumeContexts: contexts.length,
      totalJobDescriptions: jobs.length,
    };
  }

  /**
   * Cleanup stale sessions (called periodically)
   * Redis handles this automatically via TTL, but this can force cleanup
   */
  async cleanupStaleSessions(maxIdleMinutes: number = 30): Promise<number> {
    const allSessions = await this.getActiveSessions();
    const now = Date.now();
    const maxIdleMs = maxIdleMinutes * 60 * 1000;
    let cleaned = 0;

    for (const userId of allSessions) {
      const metadata = await this.getSessionMetadata(userId);

      if (metadata && now - metadata.lastAccessedAt > maxIdleMs) {
        await this.clearUserSession(userId);
        cleaned++;
      }
    }

    console.log(`🧹 Cleaned up ${cleaned} stale sessions`);
    return cleaned;
  }

  /**
   * Clear all session data (use with caution!)
   */
  async clearAll(): Promise<void> {
    const patterns = [
      `${KEY_PREFIX.CHAT_SESSION}*`,
      `${KEY_PREFIX.CONVERSATION}*`,
      `${KEY_PREFIX.RESUME_CONTEXT}*`,
      `${KEY_PREFIX.JOB_DESCRIPTION}*`,
      `${KEY_PREFIX.SESSION_METADATA}*`,
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }

    console.log("🗑️  Cleared all session data");
  }
}
