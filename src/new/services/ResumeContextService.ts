import { fetchResumeContext as fetchResumeFromDB } from "../../utils/chatUtils";

/**
 * Manages resume context caching and retrieval
 */
export class ResumeContextService {
  private static instance: ResumeContextService;
  private cache: Map<string, string[]>;

  private constructor() {
    this.cache = new Map();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ResumeContextService {
    if (!ResumeContextService.instance) {
      ResumeContextService.instance = new ResumeContextService();
    }
    return ResumeContextService.instance;
  }

  /**
   * Fetch resume context - checks cache first, then fetches from source
   */
  public async fetchResumeContext(userId: string): Promise<string[]> {
    // Check cache first
    const cachedContext = this.getFromCache(userId);
    if (cachedContext) {
      console.log(`Using cached resume context for user: ${userId}`);
      return cachedContext;
    }

    // Fetch from source (database/vector store)
    console.log(`Fetching fresh resume context for user: ${userId}`);
    const retrievedDocs = await fetchResumeFromDB(userId, new Map());

    // Cache the result
    this.setCache(userId, retrievedDocs);

    return retrievedDocs;
  }

  /**
   * Fetch resume context as a single string
   */
  public async fetchResumeContextAsString(userId: string): Promise<string> {
    const docs = await this.fetchResumeContext(userId);
    return docs.join("\n\n");
  }

  /**
   * Get resume context from cache
   */
  public getFromCache(userId: string): string[] | undefined {
    return this.cache.get(userId);
  }

  /**
   * Store resume context in cache
   */
  public setCache(userId: string, context: string[]): void {
    this.cache.set(userId, context);
    console.log(`Cached resume context for user: ${userId}`);
  }

  /**
   * Check if user has cached context
   */
  public hasCache(userId: string): boolean {
    return this.cache.has(userId);
  }

  /**
   * Clear cache for specific user
   */
  public clearUserCache(userId: string): void {
    if (this.cache.has(userId)) {
      this.cache.delete(userId);
      console.log(`Cleared resume cache for user: ${userId}`);
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
   * Get all cached user IDs
   */
  public getCachedUserIds(): string[] {
    return Array.from(this.cache.keys());
  }
}
