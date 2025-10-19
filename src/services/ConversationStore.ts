import { Redis } from "ioredis";
import { RedisSessionStore } from "./RedisSessionStore";

/**
 * Manages conversation memory using Redis for persistence
 * Replaces MemoryVectorStore with Redis-backed storage
 */
export class ConversationStore {
  private static instance: ConversationStore;
  private redisStore: RedisSessionStore;

  private constructor(redis: Redis) {
    this.redisStore = RedisSessionStore.getInstance(redis);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(redis?: Redis): ConversationStore {
    if (!ConversationStore.instance) {
      if (!redis) {
        throw new Error("Redis client required for first getInstance call");
      }
      ConversationStore.instance = new ConversationStore(redis);
    }
    return ConversationStore.instance;
  }

  /**
   * Store a conversation turn (both user input and AI response)
   */
  public async storeTurn(
    userId: string,
    input: string,
    output: string
  ): Promise<void> {
    await this.redisStore.addConversationTurn(userId, input, output);
  }

  /**
   * Store a single message (user or AI)
   */
  public async storeMessage(
    userId: string,
    message: string,
    role: "user" | "ai"
  ): Promise<void> {
    await this.redisStore.addConversationMessage(userId, {
      role,
      content: message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Fetch relevant conversation context based on a query
   * Note: Redis stores chronologically, not with semantic search
   * Returns recent conversation history
   */
  public async fetchContext(
    userId: string,
    query: string,
    maxResults: number = 10
  ): Promise<string> {
    // Get recent conversation history from Redis
    const history = await this.redisStore.getConversationHistoryString(
      userId,
      maxResults
    );

    if (!history || history.trim().length === 0) {
      console.log(`No conversation history for user: ${userId}`);
      return "";
    }

    console.log(
      `Fetched conversation context for user: ${userId} (${maxResults} messages)`
    );

    return history;
  }

  /**
   * Get all conversation history for a user
   */
  public async getAllHistory(userId: string): Promise<string> {
    return await this.redisStore.getConversationHistoryString(userId, 100);
  }

  /**
   * Clear conversation history for a specific user
   */
  public async clearUserHistory(userId: string): Promise<void> {
    await this.redisStore.clearConversationHistory(userId);
  }

  /**
   * Check if user has conversation history
   */
  public async hasHistory(userId: string): Promise<boolean> {
    const turnCount = await this.redisStore.getConversationTurnCount(userId);
    return turnCount > 0;
  }

  /**
   * Clear all conversation stores (useful for testing or cleanup)
   */
  public async clearAll(): Promise<void> {
    await this.redisStore.clearAll();
  }
}
