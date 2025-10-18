import { getToolConfig } from "../config/InterviewToolsConfig";
import { PromptBuilder } from "../config/PromptBuilder";
import { AI_MODEL } from "../constants";
import { ChatSessionConfig } from "../types/interviewTypes";
import { getGenAI } from "../utils/chatUtils";

/**
 * Manages GenAI chat sessions for users
 */
export class ChatSessionManager {
  private static instance: ChatSessionManager;
  private sessions: Map<string, any>;

  private constructor() {
    this.sessions = new Map();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ChatSessionManager {
    if (!ChatSessionManager.instance) {
      ChatSessionManager.instance = new ChatSessionManager();
    }
    return ChatSessionManager.instance;
  }

  /**
   * Create a new chat session with resume context
   */
  public createSession(
    userId: string,
    resumeContext: string,
    jobDescription?: string
  ): any {
    const toolConfig = getToolConfig();
    const config: ChatSessionConfig = {
      model: AI_MODEL,
      temperature: 0.7,
      systemInstruction: PromptBuilder.buildSystemPrompt({
        resumeContext,
        jobDescription,
      }),
      maxOutputTokens: 1000,
      tools: toolConfig.tools,
      toolConfig: toolConfig.toolConfig,
    };

    const chat = getGenAI.chats.create({
      model: config.model,
      config: {
        temperature: config.temperature,
        systemInstruction: config.systemInstruction,
        maxOutputTokens: config.maxOutputTokens,
        tools: config.tools,
        toolConfig: config.toolConfig,
      },
    });

    this.sessions.set(userId, chat);
    console.log(`Created new chat session for user: ${userId}`);

    return chat;
  }

  /**
   * Get existing session or return null
   */
  public getSession(userId: string): any | null {
    return this.sessions.get(userId) || null;
  }

  /**
   * Check if user has an active session
   */
  public hasSession(userId: string): boolean {
    return this.sessions.has(userId);
  }

  /**
   * Delete a user's session
   */
  public deleteSession(userId: string): void {
    if (this.sessions.has(userId)) {
      this.sessions.delete(userId);
      console.log(`Deleted chat session for user: ${userId}`);
    }
  }

  /**
   * Get or create a session
   */
  public getOrCreateSession(
    userId: string,
    resumeContext: string,
    jobDescription?: string
  ): any {
    const existingSession = this.getSession(userId);
    if (existingSession) {
      return existingSession;
    }
    return this.createSession(userId, resumeContext, jobDescription);
  }

  /**
   * Restart session (delete old and create new)
   */
  public restartSession(
    userId: string,
    resumeContext: string,
    jobDescription?: string
  ): any {
    this.deleteSession(userId);
    return this.createSession(userId, resumeContext, jobDescription);
  }

  /**
   * Get session history length
   */
  public getSessionTurnCount(userId: string): number {
    const session = this.getSession(userId);
    if (!session) {
      return 0;
    }

    try {
      const history = session.getHistory();
      return Math.floor(history.length / 2); // Rough estimate of Q&A pairs
    } catch (error) {
      console.error(`Error getting history for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Clear all sessions
   */
  public clearAll(): void {
    this.sessions.clear();
    console.log("Cleared all chat sessions");
  }

  /**
   * Get active session count
   */
  public getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all active user IDs
   */
  public getActiveUserIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Set the selected resumeId for the user's session
   */
  setSessionResumeId(userId: string, resumeId: number): void {
    const session = this.getSession(userId);
    if (session) {
      session.resumeId = resumeId;
    }
  }
}
