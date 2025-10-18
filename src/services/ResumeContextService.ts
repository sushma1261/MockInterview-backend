import { Redis } from "ioredis";
import { Pool } from "pg";
import { fetchResumeContextFromDB } from "../utils/chatUtils";
import { ResumeService } from "./ResumeService";
import { UserProfileService } from "./UserProfileService";

/**
 * Manages resume context caching and retrieval
 */
export class ResumeContextService {
  private static instance: ResumeContextService | null = null;
  private cache: Map<string, string[]>;
  private resumeService: ResumeService;
  private userProfileService: UserProfileService;

  constructor(pool: Pool, redis: Redis) {
    this.cache = new Map();
    this.resumeService = new ResumeService(pool, redis);
    this.userProfileService = new UserProfileService(pool, redis);
  }

  /**
   * Get singleton instance
   */
  static getInstance(pool?: Pool, redis?: Redis): ResumeContextService {
    if (!ResumeContextService.instance) {
      if (!pool || !redis) {
        throw new Error(
          "ResumeContextService requires pool and redis on first getInstance call"
        );
      }
      ResumeContextService.instance = new ResumeContextService(pool, redis);
    }
    return ResumeContextService.instance;
  }

  /**
   * Fetch resume context - checks cache first, then fetches from source
   * @param userId - Firebase user ID
   * @param resumeId - Optional specific resume ID to fetch context from
   */
  public async fetchResumeContext(
    userId: string,
    resumeId: number | null = null
  ): Promise<string[]> {
    // Create cache key
    const cacheKey = resumeId ? `${userId}:resume:${resumeId}` : userId;

    // Check cache first
    const cachedContext = this.getFromCache(cacheKey);
    if (cachedContext) {
      console.log(`Using cached resume context for key: ${cacheKey}`);
      return cachedContext;
    }

    // Fetch from source (database/vector store)
    console.log(
      `Fetching fresh resume context for user: ${userId}, resume: ${
        resumeId || "all"
      }`
    );
    const retrievedDocs = await fetchResumeContextFromDB(
      userId,
      resumeId,
      new Map()
    );

    // Cache the result
    this.setCache(cacheKey, retrievedDocs);

    return retrievedDocs;
  }

  /**
   * Fetch resume context as a single string
   * @param userId - Firebase user ID
   * @param resumeId - Optional specific resume ID to fetch context from
   */
  public async fetchResumeContextAsString(
    userId: string,
    resumeId: number | null = null
  ): Promise<string> {
    const docs = await this.fetchResumeContext(userId, resumeId);
    return docs.join("\n\n");
  }

  /**
   * Get resume context from cache
   */
  public getFromCache(cacheKey: string): string[] | undefined {
    return this.cache.get(cacheKey);
  }

  /**
   * Store resume context in cache
   */
  public setCache(cacheKey: string, context: string[]): void {
    this.cache.set(cacheKey, context);
    console.log(`Cached resume context for key: ${cacheKey}`);
  }

  /**
   * Check if user has cached context
   */
  public hasCache(cacheKey: string): boolean {
    return this.cache.has(cacheKey);
  }

  /**
   * Clear cache for specific user (all resumes)
   */
  public clearUserCache(userId: string): void {
    // Clear all cache entries for this user (including specific resumes)
    const keysToDelete = Array.from(this.cache.keys()).filter((key) =>
      key.startsWith(userId)
    );
    keysToDelete.forEach((key) => this.cache.delete(key));
    console.log(
      `Cleared ${keysToDelete.length} resume cache entries for user: ${userId}`
    );
  }

  /**
   * Clear cache for a specific resume
   */
  public clearResumeCache(userId: string, resumeId: number): void {
    const cacheKey = `${userId}:resume:${resumeId}`;
    if (this.cache.has(cacheKey)) {
      this.cache.delete(cacheKey);
      console.log(
        `Cleared resume cache for user: ${userId}, resume: ${resumeId}`
      );
    }
  }

  /**
   * Clear all cache
   */
  public clearAll(): void {
    this.cache.clear();
    console.log("Cleared all resume caches");
  }

  /**
   * Get cache size
   */
  public getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get all cached keys
   */
  public getCachedKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Fetch resume context by resumeId for a user (from vector store)
   * This fetches semantic chunks from the vector database
   */
  async fetchResumeContextById(
    userId: string,
    resumeId: number
  ): Promise<string> {
    // Fetch chunks from vector store for this specific resume
    const chunks = await this.fetchResumeContext(userId, resumeId);
    return chunks.join("\n\n");
  }

  /**
   * Fetch primary resume context for a user (from vector store)
   */
  async fetchPrimaryResumeContext(userId: string): Promise<string> {
    // Get primary resume ID first
    const primaryResumeId = await this.getPrimaryResumeId(userId);
    if (!primaryResumeId) {
      throw new Error("No primary resume found");
    }
    // Fetch chunks for primary resume
    return this.fetchResumeContextById(userId, primaryResumeId);
  }

  /**
   * Get primary resume ID for a user
   */
  async getPrimaryResumeId(firebaseUid: string): Promise<number | null> {
    // Convert Firebase UID to internal user ID
    const userProfile =
      await this.userProfileService.getUserProfileByFirebaseUid(firebaseUid);
    if (!userProfile) {
      console.warn(`No user profile found for Firebase UID: ${firebaseUid}`);
      return null;
    }

    const resume = await this.resumeService.getPrimaryResume(userProfile.id);
    return resume?.id || null;
  }
}
