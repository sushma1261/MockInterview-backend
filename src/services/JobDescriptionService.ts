/**
 * Manages job description storage and retrieval
 */
export class JobDescriptionService {
  private static instance: JobDescriptionService;
  private cache: Map<string, string>; // userId -> job description

  private constructor() {
    this.cache = new Map();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): JobDescriptionService {
    if (!JobDescriptionService.instance) {
      JobDescriptionService.instance = new JobDescriptionService();
    }
    return JobDescriptionService.instance;
  }

  /**
   * Store job description for a user
   */
  public setJobDescription(userId: string, jobDescription: string): void {
    this.cache.set(userId, jobDescription);
    console.log(`Stored job description for user: ${userId}`);
  }

  /**
   * Get job description for a user
   */
  public getJobDescription(userId: string): string | undefined {
    return this.cache.get(userId);
  }

  /**
   * Check if user has job description
   */
  public hasJobDescription(userId: string): boolean {
    return this.cache.has(userId) && !!this.cache.get(userId);
  }

  /**
   * Clear job description for a user
   */
  public clearJobDescription(userId: string): void {
    if (this.cache.has(userId)) {
      this.cache.delete(userId);
      console.log(`Cleared job description for user: ${userId}`);
    }
  }

  /**
   * Clear all job descriptions
   */
  public clearAll(): void {
    this.cache.clear();
    console.log("Cleared all job descriptions");
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

  /**
   * Get formatted job description for display
   */
  public getFormattedJobDescription(userId: string): string {
    const jobDesc = this.getJobDescription(userId);
    if (!jobDesc) {
      return "No job description provided.";
    }
    return jobDesc;
  }
}
