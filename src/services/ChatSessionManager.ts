import { Redis } from "ioredis";
import { getToolConfig } from "../config/InterviewToolsConfig";
import { PromptBuilder } from "../config/PromptBuilder";
import { AI_MODEL } from "../constants";
import { getGenAI } from "../utils/chatUtils";
import { RedisSessionStore } from "./RedisSessionStore";

/**
 * Manages GenAI chat sessions for users with Redis persistence
 */
export class ChatSessionManager {
  private static instance: ChatSessionManager;
  private sessions: Map<string, any>; // In-memory cache for active chats
  private sessionNeedsHistorySeed: Map<string, boolean>; // Track if session needs history on first turn
  private redisStore: RedisSessionStore;

  private constructor(redis: Redis) {
    this.sessions = new Map();
    this.sessionNeedsHistorySeed = new Map();
    this.redisStore = RedisSessionStore.getInstance(redis);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(redis?: Redis): ChatSessionManager {
    if (!ChatSessionManager.instance) {
      if (!redis) {
        throw new Error("Redis client required for first getInstance call");
      }
      ChatSessionManager.instance = new ChatSessionManager(redis);
    }
    return ChatSessionManager.instance;
  }

  /**
   * Create a GenAI chat object with the given system prompt
   * Common logic shared by createSession and reconstructChatFromRedis
   */
  private createChatObject(systemPrompt: string): any {
    const toolConfig = getToolConfig();

    return getGenAI.chats.create({
      model: AI_MODEL,
      config: {
        temperature: 0.7,
        systemInstruction: systemPrompt,
        maxOutputTokens: 1000,
        tools: toolConfig.tools,
        toolConfig: toolConfig.toolConfig as any, // Type assertion for compatibility
      },
    });
  }

  /**
   * Create a new chat session with resume context and persist to Redis
   */
  public async createSession(
    userId: string,
    resumeContext: string,
    jobDescription?: string,
  ): Promise<any> {
    const systemPrompt = PromptBuilder.buildSystemPrompt({
      resumeContext,
      jobDescription,
    });

    // Create chat using common function
    const chat = this.createChatObject(systemPrompt);

    // Store in memory for quick access
    this.sessions.set(userId, chat);
    // New sessions don't need history seeding (they're fresh)
    this.sessionNeedsHistorySeed.set(userId, false);

    // Persist to Redis with TTL
    await this.redisStore.saveChatSession(userId, {
      systemPrompt,
      history: [],
      jobDescription,
    });

    console.log(`Created new chat session for user: ${userId}`);

    return chat;
  }

  /**
   * Get existing session from memory or restore from Redis
   */
  public async getSession(userId: string): Promise<any | null> {
    // Check memory cache first
    if (this.sessions.has(userId)) {
      return this.sessions.get(userId);
    }

    // Try to restore from Redis
    const sessionData = await this.redisStore.getChatSession(userId);
    if (sessionData) {
      console.log(`🔄 Restoring session from Redis for user: ${userId}`);

      // Reconstruct GenAI chat object from stored data
      const reconstructedChat = await this.reconstructChatFromRedis(
        userId,
        sessionData,
      );

      if (reconstructedChat) {
        // Cache in memory for future requests
        this.sessions.set(userId, reconstructedChat);
        // Reconstructed sessions need history on first turn
        this.sessionNeedsHistorySeed.set(userId, true);
        console.log(`✅ Successfully restored session for user: ${userId}`);
        return reconstructedChat;
      }
    }

    return null;
  }

  /**
   * Reconstruct GenAI chat object from Redis session data
   * This allows resuming chats after server restart
   */
  private async reconstructChatFromRedis(
    userId: string,
    sessionData: {
      systemPrompt: string;
      history: any[];
      resumeId?: number;
      jobDescription?: string;
    },
  ): Promise<any | null> {
    try {
      // Create chat using common function
      const chat = this.createChatObject(sessionData.systemPrompt);

      // Restore conversation history if it exists by replaying messages
      if (sessionData.history && sessionData.history.length > 0) {
        console.log(
          `📝 Will replay ${sessionData.history.length} history items for user: ${userId} on first turn`,
        );
        // Note: History will be injected in the FIRST prompt after reconstruction
        // After that, SDK maintains context automatically
      }

      return chat;
    } catch (error) {
      console.error(`❌ Failed to reconstruct chat for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Check if user has an active session (check memory and Redis)
   */
  public async hasSession(userId: string): Promise<boolean> {
    // Check memory first
    if (this.sessions.has(userId)) {
      return true;
    }

    // Check Redis
    return await this.redisStore.hasChatSession(userId);
  }

  /**
   * Delete a user's session from memory and Redis
   */
  public async deleteSession(userId: string): Promise<void> {
    if (this.sessions.has(userId)) {
      this.sessions.delete(userId);
      this.sessionNeedsHistorySeed.delete(userId);
      console.log(`Deleted chat session from memory for user: ${userId}`);
    }

    await this.redisStore.deleteChatSession(userId);
  }

  /**
   * Get or create a session
   */
  public async getOrCreateSession(
    userId: string,
    resumeContext: string,
    jobDescription?: string,
  ): Promise<any> {
    const existingSession = await this.getSession(userId);
    if (existingSession) {
      return existingSession;
    }
    return await this.createSession(userId, resumeContext, jobDescription);
  }

  /**
   * Restart session (delete old and create new)
   */
  public async restartSession(
    userId: string,
    resumeContext: string,
    jobDescription?: string,
  ): Promise<any> {
    await this.deleteSession(userId);
    return await this.createSession(userId, resumeContext, jobDescription);
  }

  /**
   * Get session history length from Redis
   */
  public async getSessionTurnCount(userId: string): Promise<number> {
    // Try to get from Redis conversation history
    const turnCount = await this.redisStore.getConversationTurnCount(userId);
    return turnCount;
  }

  /**
   * Clear all sessions from memory and Redis
   */
  public async clearAll(): Promise<void> {
    this.sessions.clear();
    this.sessionNeedsHistorySeed.clear();
    await this.redisStore.clearAll();
    console.log("Cleared all chat sessions");
  }

  /**
   * Get active session count from Redis
   */
  public async getActiveSessionCount(): Promise<number> {
    return await this.redisStore.getActiveSessionCount();
  }

  /**
   * Get all active user IDs from Redis
   */
  public async getActiveUserIds(): Promise<string[]> {
    return await this.redisStore.getActiveSessions();
  }

  /**
   * Set the selected resumeId for the user's session in Redis
   */
  async setSessionResumeId(userId: string, resumeId: number): Promise<void> {
    const session = await this.getSession(userId);
    if (session) {
      session.resumeId = resumeId;
    }

    // Update in Redis
    const sessionData = await this.redisStore.getChatSession(userId);
    if (sessionData) {
      sessionData.resumeId = resumeId;
      await this.redisStore.saveChatSession(userId, sessionData);
    }
  }

  /**
   * Check if session needs history seeding (first turn after reconstruction)
   * Returns true if history should be included in prompt
   */
  public needsHistorySeed(userId: string): boolean {
    return this.sessionNeedsHistorySeed.get(userId) || false;
  }

  /**
   * Mark that history has been seeded for this session
   * Call after first turn with history injection
   */
  public markHistorySeeded(userId: string): void {
    this.sessionNeedsHistorySeed.set(userId, false);
    console.log(
      `✅ History seeded for session: ${userId} - SDK will maintain context from now`,
    );
  }
}
