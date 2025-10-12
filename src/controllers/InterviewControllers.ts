import { PromptBuilder } from "../config/PromptBuilder";
import { ChatSessionManager } from "../services/ChatSessionManager";
import { ConversationStore } from "../services/ConversationStore";
import { ResumeContextService } from "../services/ResumeContextService";
import { StreamProcessor } from "../services/StreamProcessor";
import {
  ChatRequest,
  ChatResponse,
  InterviewAction,
  StreamProcessingResult,
} from "../types/interviewTypes";

/**
 * High-level controller for interview operations
 * Orchestrates all services to handle interview flow
 */
export class InterviewController {
  private conversationStore: ConversationStore;
  private resumeContextService: ResumeContextService;
  private chatSessionManager: ChatSessionManager;
  private streamProcessor: StreamProcessor;

  constructor() {
    this.conversationStore = ConversationStore.getInstance();
    this.resumeContextService = ResumeContextService.getInstance();
    this.chatSessionManager = ChatSessionManager.getInstance();
    this.streamProcessor = new StreamProcessor();
  }

  /**
   * Process a chat request
   */
  async processChat(
    userId: string,
    request: ChatRequest
  ): Promise<ChatResponse> {
    const { message, action, question_number } = request;

    // Handle session creation/restart
    const chat = await this.handleSession(userId, action);

    // Build prompt
    const conversationHistory = await this.conversationStore.fetchContext(
      userId,
      "interview",
      10
    );

    const prompt = PromptBuilder.buildPrompt(
      action || InterviewAction.CONTINUE,
      conversationHistory,
      message || "",
      question_number
    );

    // Store user message if provided
    if (
      message &&
      action !== InterviewAction.START &&
      action !== InterviewAction.RESTART
    ) {
      await this.conversationStore.storeMessage(userId, message, "user");
    }

    // Process stream
    const stream = await chat.sendMessageStream({ message: prompt });
    const streamResult = await this.streamProcessor.processStream(
      stream,
      userId
    );

    // Validate result
    const validation = this.streamProcessor.validateStreamResult(streamResult);
    if (!validation.isValid) {
      throw new Error(validation.error || "Invalid stream response");
    }

    // Build and return response
    const response = this.buildResponse(
      streamResult,
      action || InterviewAction.CONTINUE,
      userId
    );

    // Cleanup if interview is complete
    if (
      streamResult.functionCallResult?.type === "generate_feedback" &&
      streamResult.functionCallResult.is_final
    ) {
      this.chatSessionManager.deleteSession(userId);
    }

    return response;
  }

  /**
   * Handle session creation or retrieval
   */
  private async handleSession(
    userId: string,
    action?: InterviewAction | string
  ): Promise<any> {
    const shouldCreateNew =
      !this.chatSessionManager.hasSession(userId) ||
      action === InterviewAction.START ||
      action === InterviewAction.RESTART;

    if (!shouldCreateNew) {
      const existingSession = this.chatSessionManager.getSession(userId);
      if (!existingSession) {
        throw new Error("No active session found");
      }
      return existingSession;
    }

    // Get resume context
    const resumeContext = await this.getResumeContext(userId);

    // Create or restart session
    if (action === InterviewAction.RESTART) {
      this.conversationStore.clearUserHistory(userId);
      return this.chatSessionManager.restartSession(userId, resumeContext);
    }

    return this.chatSessionManager.createSession(userId, resumeContext);
  }

  /**
   * Get resume context (cached or fresh)
   */
  private async getResumeContext(userId: string): Promise<string> {
    return await this.resumeContextService.fetchResumeContextAsString(userId);
  }

  /**
   * Build chat response object
   */
  private buildResponse(
    streamResult: StreamProcessingResult,
    action: string,
    userId: string
  ): ChatResponse {
    const { fullText, functionCallResult } = streamResult;

    const response: ChatResponse = {
      success: true,
      action: action,
      turn_count: this.chatSessionManager.getSessionTurnCount(userId),
    };

    if (functionCallResult) {
      response.type = functionCallResult.type;

      // Type-specific response fields
      if (
        functionCallResult.type === "start_interview" ||
        functionCallResult.type === "ask_next_question"
      ) {
        response.question = functionCallResult.question;
        response.question_number = functionCallResult.question_number;
        response.question_type = functionCallResult.question_type;
        response.reasoning = functionCallResult.reasoning;
      } else if (functionCallResult.type === "generate_feedback") {
        response.feedback = functionCallResult;
        response.is_complete = functionCallResult.is_final;
      }
    }

    if (fullText) {
      response.context = fullText;
    }

    return response;
  }

  /**
   * Clear user's interview session
   */
  async clearSession(userId: string): Promise<void> {
    this.chatSessionManager.deleteSession(userId);
    this.conversationStore.clearUserHistory(userId);
  }

  /**
   * Get session status
   */
  getStatus(userId: string): {
    has_active_session: boolean;
    turn_count: number;
    has_history: boolean;
  } {
    return {
      has_active_session: this.chatSessionManager.hasSession(userId),
      turn_count: this.chatSessionManager.getSessionTurnCount(userId),
      has_history: this.conversationStore.hasHistory(userId),
    };
  }

  /**
   * Clear all data (useful for testing)
   */
  clearAll(): void {
    this.chatSessionManager.clearAll();
    this.conversationStore.clearAll();
    this.resumeContextService.clearAll();
  }
}
