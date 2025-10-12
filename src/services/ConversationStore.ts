import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { getTextEmbeddingsAPI } from "../utils/chatUtils";

/**
 * Manages conversation memory using vector stores for semantic search
 */
export class ConversationStore {
  private static instance: ConversationStore;
  private userStores: Map<string, MemoryVectorStore>;

  private constructor() {
    this.userStores = new Map();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ConversationStore {
    if (!ConversationStore.instance) {
      ConversationStore.instance = new ConversationStore();
    }
    return ConversationStore.instance;
  }

  /**
   * Get or create a vector store for a specific user
   */
  private getOrCreateStore(userId: string): MemoryVectorStore {
    if (!this.userStores.has(userId)) {
      this.userStores.set(
        userId,
        new MemoryVectorStore(getTextEmbeddingsAPI())
      );
      console.log(`Created new conversation store for user: ${userId}`);
    }
    return this.userStores.get(userId)!;
  }

  /**
   * Store a conversation turn (both user input and AI response)
   */
  public async storeTurn(
    userId: string,
    input: string,
    output: string
  ): Promise<void> {
    const store = this.getOrCreateStore(userId);

    await store.addDocuments([
      {
        pageContent: `Human: ${input}`,
        metadata: {
          role: "user",
          timestamp: new Date().toISOString(),
        },
      },
      {
        pageContent: `AI: ${output}`,
        metadata: {
          role: "ai",
          timestamp: new Date().toISOString(),
        },
      },
    ]);

    console.log(`Stored conversation turn for user: ${userId}`);
  }

  /**
   * Store a single message (user or AI)
   */
  public async storeMessage(
    userId: string,
    message: string,
    role: "user" | "ai"
  ): Promise<void> {
    const store = this.getOrCreateStore(userId);
    const prefix = role === "user" ? "Human:" : "AI:";

    await store.addDocuments([
      {
        pageContent: `${prefix} ${message}`,
        metadata: {
          role,
          timestamp: new Date().toISOString(),
        },
      },
    ]);

    console.log(`Stored ${role} message for user: ${userId}`);
  }

  /**
   * Fetch relevant conversation context based on a query
   */
  public async fetchContext(
    userId: string,
    query: string,
    maxResults: number = 5
  ): Promise<string> {
    const store = this.getOrCreateStore(userId);

    // Check if store has any documents
    const allDocs = await store.similaritySearch("", 1).catch(() => []);
    if (allDocs.length === 0) {
      console.log(`No conversation history for user: ${userId}`);
      return "";
    }

    const docs = await store.similaritySearch(query, maxResults);
    console.log(
      `Fetched ${docs.length} conversation context docs for user: ${userId}`
    );

    return docs.map((d) => d.pageContent).join("\n");
  }

  /**
   * Get all conversation history for a user
   */
  public async getAllHistory(userId: string): Promise<string> {
    return this.fetchContext(userId, "", 100);
  }

  /**
   * Clear conversation history for a specific user
   */
  public clearUserHistory(userId: string): void {
    if (this.userStores.has(userId)) {
      this.userStores.delete(userId);
      console.log(`Cleared conversation history for user: ${userId}`);
    }
  }

  /**
   * Check if user has conversation history
   */
  public hasHistory(userId: string): boolean {
    return this.userStores.has(userId);
  }

  /**
   * Clear all conversation stores (useful for testing or cleanup)
   */
  public clearAll(): void {
    this.userStores.clear();
    console.log("Cleared all conversation stores");
  }
}
