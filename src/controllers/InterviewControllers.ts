import { Redis } from "ioredis";
import { Pool } from "pg";
import { PromptBuilder } from "../config/PromptBuilder";
import { ChatSessionManager } from "../services/ChatSessionManager";
import { ConversationStore } from "../services/ConversationStore";
import { JobDescriptionService } from "../services/JobDescriptionService";
import { ResumeContextService } from "../services/ResumeContextService";
import {
  StreamChunkCallback,
  StreamProcessor,
} from "../services/StreamProcessor";
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
  private jobDescriptionService: JobDescriptionService;

  constructor(pool: Pool, redis: Redis) {
    this.conversationStore = ConversationStore.getInstance();
    this.resumeContextService = ResumeContextService.getInstance(pool, redis);
    this.jobDescriptionService = JobDescriptionService.getInstance();
    this.chatSessionManager = ChatSessionManager.getInstance();
    this.streamProcessor = new StreamProcessor();
  }

  /**
   * Process a chat request (non-streaming - waits for complete response)
   * Supports optional resumeId for selecting resume context
   */
  async processChat(
    userId: string,
    request: ChatRequest & { resume_id?: number }
  ): Promise<ChatResponse> {
    const { message, action, question_number, job_description, resume_id } =
      request;

    if (job_description) {
      console.log(`Setting job description for user: ${userId}`);
      this.jobDescriptionService.setJobDescription(userId, job_description);
    } else {
      console.log(`No job description provided for user: ${userId}`);
    }

    // Handle session creation/restart, pass resume_id
    const chat = await this.handleSession(userId, action, resume_id);

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

    // Process stream (non-streaming mode)
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
   * Process a chat request WITH STREAMING support
   * Calls onChunk callback for each chunk received from GenAI
   */
  async processChatStreaming(
    userId: string,
    request: ChatRequest,
    onChunk: StreamChunkCallback
  ): Promise<ChatResponse> {
    const { message, action, question_number, job_description } = request;

    if (job_description) {
      this.jobDescriptionService.setJobDescription(userId, job_description);
    }

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

    // Process stream WITH CALLBACK (streaming mode)
    const stream = await chat.sendMessageStream({ message: prompt });
    const streamResult = await this.streamProcessor.processStreamWithCallback(
      stream,
      userId,
      onChunk // ← Pass callback to stream chunks to frontend
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
   * Accepts optional resumeId to select resume context
   */
  private async handleSession(
    userId: string,
    action?: InterviewAction | string,
    resume_id?: number
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

    // Get resume context (by resumeId or primary)
    let resumeContext: string;
    console.log(
      `Fetching resume context for user: ${userId}, resumeId: ${resume_id}`
    );
    if (resume_id) {
      console.log(`Fetching context for specified resumeId: ${resume_id}`);
      // Fetch by resumeId
      resumeContext = await this.resumeContextService.fetchResumeContextById(
        userId,
        resume_id
      );
      // Store selected resumeId in session
      this.chatSessionManager.setSessionResumeId(userId, resume_id);
    } else {
      console.log(`Fetching context for primary resume`);
      // Fetch primary resume
      resumeContext = await this.resumeContextService.fetchPrimaryResumeContext(
        userId
      );
      // Store primary resumeId in session (if found)
      const primaryId = await this.resumeContextService.getPrimaryResumeId(
        userId
      );
      if (primaryId) {
        this.chatSessionManager.setSessionResumeId(userId, primaryId);
      }
    }
    const jobDescription = this.jobDescriptionService.getJobDescription(userId);
    console.log(
      `Job description for user ${userId}: ${jobDescription || "none"}`
    );

    // Create or restart session
    if (action === InterviewAction.RESTART) {
      this.conversationStore.clearUserHistory(userId);
      return this.chatSessionManager.restartSession(
        userId,
        resumeContext,
        jobDescription
      );
    }

    return this.chatSessionManager.createSession(
      userId,
      resumeContext,
      jobDescription
    );
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
      response.data = functionCallResult;

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
    this.resumeContextService.clearUserCache(userId);
    this.jobDescriptionService.clearJobDescription(userId);
  }

  /**
   * Get session status
   */
  getStatus(userId: string): {
    has_active_session: boolean;
    turn_count: number;
    has_history: boolean;
    has_job_description: boolean;
  } {
    return {
      has_active_session: this.chatSessionManager.hasSession(userId),
      turn_count: this.chatSessionManager.getSessionTurnCount(userId),
      has_history: this.conversationStore.hasHistory(userId),
      has_job_description:
        !!this.jobDescriptionService.getJobDescription(userId),
    };
  }

  /**
   * Clear all data (useful for testing)
   */
  clearAll(): void {
    this.chatSessionManager.clearAll();
    this.conversationStore.clearAll();
    this.resumeContextService.clearAll();
    this.jobDescriptionService.clearAll();
  }
}
