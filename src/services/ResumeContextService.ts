import ServiceFactory from "./ServiceFactory";
import { VectorStoreService } from "./VectorStoreService";

/**
 * Manages resume context caching and retrieval
 */
export class ResumeContextService {
  private static instance: ResumeContextService | null = null;
  private cache: Map<string, string[]>;
  private resumeService = ServiceFactory.getResumeService();
  private userProfileService = ServiceFactory.getUserProfileService();

  constructor() {
    this.cache = new Map();
  }

  /**
   * Fetch resume context from vector store database
   * Private method that handles the actual vector similarity search
   */
  private async fetchResumeContextFromDB(
    userId: string,
    resumeId: number | null,
  ): Promise<string[]> {
    console.log(
      `🔍 Fetching resume context from vector store for user: ${userId}, resume: ${
        resumeId || "all"
      }`,
    );

    try {
      // Use singleton vector store instance
      const vectorStore = await VectorStoreService.getInstance();

      // Build filter - metadata is JSONB in PostgreSQL
      // The metadata column contains: { user_id: "string", resume_id: number, chunk_index: number, file_name: string }
      // PGVectorStore uses JSONB containment operator (@>) for filtering
      const filter: Record<string, any> = {
        user_id: userId, // Must match the user
      };

      // If resumeId is specified, also filter by resume_id in metadata
      // Store resume_id as NUMBER (not string) to match the stored metadata
      if (resumeId !== null) {
        filter.resume_id = resumeId; // Keep as number
      }

      console.log(`🔍 Applying filter:`, JSON.stringify(filter, null, 2));

      // PGVectorStore.similaritySearch signature:
      // similaritySearch(query: string, k?: number, filter?: Record<string, any>)
      // The filter is passed as the third parameter directly
      const docs = await vectorStore.similaritySearch(
        "help me prepare for behavioral interview based on the resume uploaded.",
        resumeId !== null ? 5 : 3, // k: number of results
        filter, // filter: applied to metadata JSONB column using @> operator
      );

      console.log(
        `✅ Found ${docs.length} chunks for user ${userId}${
          resumeId ? `, resume ${resumeId}` : ""
        }`,
      );

      // Debug: Log the metadata of returned docs to verify filtering
      if (docs.length > 0) {
        console.log(
          `📄 Sample metadata from first chunk:`,
          JSON.stringify(docs[0].metadata, null, 2),
        );

        // Verify all docs belong to the user (safety check)
        const wrongUserDocs = docs.filter(
          (doc) => doc.metadata.user_id !== userId,
        );
        if (wrongUserDocs.length > 0) {
          console.error(
            `⚠️ WARNING: Found ${wrongUserDocs.length} chunks that don't belong to user ${userId}!`,
          );
          // Filter out wrong user docs
          const filteredDocs = docs.filter(
            (doc) => doc.metadata.user_id === userId,
          );
          console.log(
            `🔒 Applied client-side filtering: ${filteredDocs.length}/${docs.length} chunks kept`,
          );
          return filteredDocs.map((d) => d.pageContent);
        }
      }

      return docs.map((d) => d.pageContent);
    } catch (e) {
      console.error("❌ Error fetching resume context from vector store:", e);
      return [];
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ResumeContextService {
    if (!ResumeContextService.instance) {
      ResumeContextService.instance = new ResumeContextService();
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
    resumeId: number | null = null,
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
      }`,
    );
    const retrievedDocs = await this.fetchResumeContextFromDB(userId, resumeId);

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
    resumeId: number | null = null,
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
      key.startsWith(userId),
    );
    keysToDelete.forEach((key) => this.cache.delete(key));
    console.log(
      `Cleared ${keysToDelete.length} resume cache entries for user: ${userId}`,
    );
  }

  /**
   * Clear all cache
   */
  public clearAll(): void {
    this.cache.clear();
    console.log("Cleared all resume caches");
  }

  /**
   * Fetch resume context by resumeId for a user (from vector store)
   * This fetches semantic chunks from the vector database
   */
  async fetchResumeContextById(
    userId: string,
    resumeId: number,
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
