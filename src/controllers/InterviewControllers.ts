import { Redis } from "ioredis";
import { Pool } from "pg";
import { PromptBuilder } from "../config/PromptBuilder";
import { ChatSessionManager } from "../services/ChatSessionManager";
import { ConversationStore } from "../services/ConversationStore";
import { InterviewSessionService } from "../services/InterviewSessionService";
import { RedisSessionStore } from "../services/RedisSessionStore";
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
  // private jobDescriptionService: JobDescriptionService;
  private redisStore: RedisSessionStore;
  private sessionService: InterviewSessionService;

  constructor(pool: Pool, redis: Redis) {
    this.conversationStore = ConversationStore.getInstance(redis);
    this.resumeContextService = ResumeContextService.getInstance();
    // this.jobDescriptionService = JobDescriptionService.getInstance();
    this.redisStore = RedisSessionStore.getInstance(redis);
    this.chatSessionManager = ChatSessionManager.getInstance(redis);
    this.streamProcessor = new StreamProcessor();
    this.sessionService = InterviewSessionService.getInstance(pool);
  }

  /**
   * Process a chat request (non-streaming - waits for complete response)
   * Supports optional resumeId for selecting resume context
   */
  async processChat(
    userId: string,
    userProfileId: number,
    request: ChatRequest & {
      resume_id?: number;
      job_title?: string;
      company_name?: string;
    },
  ): Promise<ChatResponse> {
    const {
      message,
      action,
      question_number,
      job_description,
      resume_id,
      job_title,
      company_name,
    } = request;

    console.log(
      `📞 === [NON-STREAMING] processChat START === User: ${userId}, Action: ${
        action || "continue"
      }`,
    );

    if (job_description) {
      console.log(`Setting job description for user: ${userId}`);
      await this.redisStore.saveJobDescription(userId, job_description);
    } else {
      console.log(`No job description provided for user: ${userId}`);
    }

    // Get actual resume_id (from request, active session, or primary)
    let actualResumeId: number;
    if (resume_id) {
      actualResumeId = resume_id;
    } else {
      // Try to get from active session first
      const activeSession =
        await this.sessionService.getActiveSession(userProfileId);
      if (activeSession) {
        actualResumeId = activeSession.resume_id;
        console.log(`📋 Using resume_id ${actualResumeId} from active session`);
      } else {
        // Fall back to primary resume
        const primaryId =
          await this.resumeContextService.getPrimaryResumeId(userId);
        if (!primaryId) {
          throw new Error(
            "No resume found for user. Please upload a resume first.",
          );
        }
        actualResumeId = primaryId;
        console.log(`📋 Using primary resume_id ${actualResumeId}`);
      }
    }

    // Handle session creation/restart, pass resume_id
    const chat = await this.handleSession(userId, action, actualResumeId);

    // Get or create PostgreSQL session for history tracking
    // If action is START, close any existing in-progress session and create new one
    const pgSessionId = await this.getOrCreatePgSession(
      userProfileId,
      actualResumeId,
      action,
      job_description,
      job_title,
      company_name,
    );

    console.log(`📊 Using PostgreSQL session ${pgSessionId} for tracking`);

    // Build prompt - only include history if this is a reconstructed session
    let conversationHistory = "";
    const needsHistory = this.chatSessionManager.needsHistorySeed(userId);

    if (needsHistory) {
      console.log(`📜 Fetching history for reconstructed session: ${userId}`);
      conversationHistory = await this.conversationStore.fetchContext(
        userId,
        "interview",
        10,
      );
    } else {
      console.log(
        `⚡ Skipping history fetch - SDK maintains context for active session: ${userId}`,
      );
    }

    const prompt = PromptBuilder.buildPrompt(
      action || InterviewAction.CONTINUE,
      conversationHistory,
      message || "",
      question_number,
    );

    // Store user message if provided
    if (
      message &&
      action !== InterviewAction.START &&
      action !== InterviewAction.RESTART
    ) {
      await this.conversationStore.storeMessage(userId, message, "user");

      // Save to PostgreSQL
      await this.sessionService.saveMessage(pgSessionId, "user", message, {
        messageType: "answer",
        questionNumber: question_number,
      });
    }

    // Process stream (non-streaming mode)
    let stream;
    try {
      stream = await chat.sendMessageStream({ message: prompt });
    } catch (error: any) {
      console.error("❌ Error calling GenAI API:", error);
      console.error("Error details:", {
        message: error.message,
        cause: error.cause,
        stack: error.stack,
      });

      // Provide more helpful error message
      if (error.message?.includes("fetch failed")) {
        throw new Error(
          "Failed to connect to Google GenAI API. This could be due to:\n" +
            "1. Network connectivity issues\n" +
            "2. Invalid API key\n" +
            "3. API service unavailable\n" +
            `Original error: ${error.message}`,
        );
      }
      throw error;
    }

    const streamResult = await this.streamProcessor.processStream(
      stream,
      userId,
    );

    // Validate result
    const validation = this.streamProcessor.validateStreamResult(streamResult);
    if (!validation.isValid) {
      throw new Error(validation.error || "Invalid stream response");
    }

    // Store assistant response to conversation history
    const funcResult = streamResult.functionCallResult;

    if (streamResult.fullText) {
      await this.conversationStore.storeMessage(
        userId,
        streamResult.fullText,
        "ai",
      );

      // Mark history as seeded if it was a reconstructed session
      if (needsHistory) {
        this.chatSessionManager.markHistorySeeded(userId);
      }

      // Save to PostgreSQL
      await this.sessionService.saveMessage(
        pgSessionId,
        "assistant",
        streamResult.fullText,
        {
          messageType: funcResult?.type || "text",
          questionNumber:
            funcResult && "question_number" in funcResult
              ? funcResult.question_number
              : undefined,
          questionType:
            funcResult && "question_type" in funcResult
              ? funcResult.question_type
              : undefined,
          functionName: funcResult?.type,
          functionResult: funcResult || undefined,
        },
      );
    } else if (funcResult) {
      // No text but we have a function call result - save it!
      const contentToSave: string =
        "question" in funcResult
          ? (funcResult.question as string)
          : "reasoning" in funcResult
            ? (funcResult.reasoning as string)
            : JSON.stringify(funcResult);

      console.log(
        `💾 [NON-STREAMING] Saving function-only response: ${funcResult.type}`,
      );

      await this.conversationStore.storeMessage(userId, contentToSave, "ai");

      await this.sessionService.saveMessage(
        pgSessionId,
        "assistant",
        contentToSave,
        {
          messageType: funcResult.type || "function_call",
          questionNumber:
            "question_number" in funcResult
              ? funcResult.question_number
              : undefined,
          questionType:
            "question_type" in funcResult
              ? funcResult.question_type
              : undefined,
          functionName: funcResult.type,
          functionResult: funcResult,
        },
      );
    } else {
      console.warn(
        `⚠️ [NON-STREAMING] No fullText OR functionResult for action ${action}, skipping message save`,
      );
    }

    // Save per-question feedback if provided in ask_next_question
    if (
      funcResult?.type === "ask_next_question" &&
      funcResult.previous_answer_feedback &&
      funcResult.question_number
    ) {
      const feedback = funcResult.previous_answer_feedback;
      const previousQuestionNumber = funcResult.question_number - 1;

      if (previousQuestionNumber > 0) {
        // Get the last two messages from the database (previous question and answer)
        const messages = await this.sessionService.getRecentMessages(
          pgSessionId,
          2,
        );

        if (messages.length >= 2) {
          const previousAnswer = messages[0]; // Most recent (user's answer)
          const previousQuestion = messages[1]; // Second most recent (AI's question)

          console.log(
            `💾 Saving feedback for question ${previousQuestionNumber}`,
          );
          await this.sessionService.saveFeedback(
            pgSessionId,
            previousQuestionNumber,
            previousQuestion.content,
            previousAnswer.content,
            {
              feedbackText: feedback.feedback_text,
              strengths: feedback.strengths,
              areasForImprovement: feedback.areas_for_improvement,
              score: feedback.score,
              questionType: previousQuestion.question_type,
            },
          );
        }
      }
    }

    // Build and return response
    const response = await this.buildResponse(
      streamResult,
      action || InterviewAction.CONTINUE,
      userId,
    );

    // Cleanup if interview is complete
    if (
      streamResult.functionCallResult?.type === "generate_feedback" &&
      streamResult.functionCallResult.is_final
    ) {
      // Complete PostgreSQL session
      await this.sessionService.completeSession(
        pgSessionId,
        streamResult.functionCallResult,
      );

      // Delete Redis session
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
    userProfileId: number,
    request: ChatRequest & {
      resume_id?: number;
      job_title?: string;
      company_name?: string;
    },
    onChunk: StreamChunkCallback,
  ): Promise<ChatResponse> {
    const {
      message,
      action,
      question_number,
      job_description,
      resume_id,
      job_title,
      company_name,
    } = request;

    console.log(
      `📞 === [STREAMING] processChatStreaming START === User: ${userId}, Action: ${
        action || "continue"
      }`,
    );

    if (job_description) {
      await this.redisStore.saveJobDescription(userId, job_description);
    }

    // Get actual resume_id (from request, active session, or primary)
    let actualResumeId: number;
    if (resume_id) {
      actualResumeId = resume_id;
    } else {
      // Try to get from active session first
      const activeSession =
        await this.sessionService.getActiveSession(userProfileId);
      if (activeSession) {
        actualResumeId = activeSession.resume_id;
        console.log(
          `📋 Using resume_id ${actualResumeId} from active session (streaming)`,
        );
      } else {
        // Fall back to primary resume
        const primaryId =
          await this.resumeContextService.getPrimaryResumeId(userId);
        if (!primaryId) {
          throw new Error(
            "No resume found for user. Please upload a resume first.",
          );
        }
        actualResumeId = primaryId;
        console.log(`📋 Using primary resume_id ${actualResumeId} (streaming)`);
      }
    }

    // Handle session creation/restart
    const chat = await this.handleSession(userId, action, actualResumeId);

    // Get or create PostgreSQL session for history tracking
    // If action is START, close any existing in-progress session and create new one
    const pgSessionId = await this.getOrCreatePgSession(
      userProfileId,
      actualResumeId,
      action,
      job_description,
      job_title,
      company_name,
    );

    console.log(
      `📊 Using PostgreSQL session ${pgSessionId} for tracking (streaming)`,
    );

    // Build prompt - only include history if this is a reconstructed session
    let conversationHistory = "";
    const needsHistory = this.chatSessionManager.needsHistorySeed(userId);

    if (needsHistory) {
      console.log(`📜 Fetching history for reconstructed session: ${userId}`);
      conversationHistory = await this.conversationStore.fetchContext(
        userId,
        "interview",
        10,
      );
    } else {
      console.log(
        `⚡ Skipping history fetch - SDK maintains context for active session: ${userId}`,
      );
    }

    const prompt = PromptBuilder.buildPrompt(
      action || InterviewAction.CONTINUE,
      conversationHistory,
      message || "",
      question_number,
    );

    // Store user message if provided
    if (
      message &&
      action !== InterviewAction.START &&
      action !== InterviewAction.RESTART
    ) {
      await this.conversationStore.storeMessage(userId, message, "user");

      // Save to PostgreSQL
      await this.sessionService.saveMessage(pgSessionId, "user", message, {
        messageType: "answer",
        questionNumber: question_number,
      });
    }

    // Process stream WITH CALLBACK (streaming mode)
    let stream;
    try {
      stream = await chat.sendMessageStream({ message: prompt });
    } catch (error: any) {
      console.error("❌ Error calling GenAI API (streaming):", error);
      console.error("Error details:", {
        message: error.message,
        cause: error.cause,
        stack: error.stack,
      });

      // Provide more helpful error message
      if (error.message?.includes("fetch failed")) {
        throw new Error(
          "Failed to connect to Google GenAI API. This could be due to:\n" +
            "1. Network connectivity issues\n" +
            "2. Invalid API key\n" +
            "3. API service unavailable\n" +
            `Original error: ${error.message}`,
        );
      }
      throw error;
    }

    const streamResult = await this.streamProcessor.processStreamWithCallback(
      stream,
      userId,
      onChunk, // ← Pass callback to stream chunks to frontend
    );

    // Validate result
    const validation = this.streamProcessor.validateStreamResult(streamResult);
    if (!validation.isValid) {
      throw new Error(validation.error || "Invalid stream response");
    }

    // Store assistant response to conversation history
    if (streamResult.fullText) {
      await this.conversationStore.storeMessage(
        userId,
        streamResult.fullText,
        "ai",
      );

      // Mark history as seeded if it was a reconstructed session
      if (needsHistory) {
        this.chatSessionManager.markHistorySeeded(userId);
      }

      // Save to PostgreSQL
      const funcResult = streamResult.functionCallResult;
      await this.sessionService.saveMessage(
        pgSessionId,
        "assistant",
        streamResult.fullText,
        {
          messageType: funcResult?.type || "text",
          questionNumber:
            funcResult && "question_number" in funcResult
              ? funcResult.question_number
              : undefined,
          questionType:
            funcResult && "question_type" in funcResult
              ? funcResult.question_type
              : undefined,
          functionName: funcResult?.type,
          functionResult: funcResult || undefined,
        },
      );
    } else if (streamResult.functionCallResult) {
      // No text but we have a function call result - save it!
      const funcResult = streamResult.functionCallResult;
      const contentToSave: string =
        "question" in funcResult
          ? (funcResult.question as string)
          : "reasoning" in funcResult
            ? (funcResult.reasoning as string)
            : JSON.stringify(funcResult);

      console.log(
        `💾 [STREAMING] Saving function-only response: ${funcResult.type}`,
      );

      await this.conversationStore.storeMessage(userId, contentToSave, "ai");

      await this.sessionService.saveMessage(
        pgSessionId,
        "assistant",
        contentToSave,
        {
          messageType: funcResult.type || "function_call",
          questionNumber:
            "question_number" in funcResult
              ? funcResult.question_number
              : undefined,
          questionType:
            "question_type" in funcResult
              ? funcResult.question_type
              : undefined,
          functionName: funcResult.type,
          functionResult: funcResult,
        },
      );
    } else {
      console.warn(
        `⚠️ [STREAMING] No fullText OR functionResult for action ${action}, skipping message save`,
      );
    }

    // Build and return response
    const response = await this.buildResponse(
      streamResult,
      action || InterviewAction.CONTINUE,
      userId,
    );

    // Cleanup if interview is complete
    if (
      streamResult.functionCallResult?.type === "generate_feedback" &&
      streamResult.functionCallResult.is_final
    ) {
      // Complete PostgreSQL session
      await this.sessionService.completeSession(
        pgSessionId,
        streamResult.functionCallResult,
      );

      // Delete Redis session
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
    resume_id?: number,
  ): Promise<any> {
    const shouldCreateNew =
      !this.chatSessionManager.hasSession(userId) ||
      action === InterviewAction.START ||
      action === InterviewAction.RESTART;

    if (!shouldCreateNew) {
      const existingSession = await this.chatSessionManager.getSession(userId);
      if (!existingSession) {
        throw new Error("No active session found");
      }
      return existingSession;
    }

    // Get resume context (by resumeId or primary)
    let resumeContext: string;
    console.log(
      `Fetching resume context for user: ${userId}, resumeId: ${resume_id}`,
    );
    if (resume_id) {
      console.log(`Fetching context for specified resumeId: ${resume_id}`);
      // Fetch by resumeId
      resumeContext = await this.resumeContextService.fetchResumeContextById(
        userId,
        resume_id,
      );
      // Store selected resumeId in session
      this.chatSessionManager.setSessionResumeId(userId, resume_id);
    } else {
      console.log(`Fetching context for primary resume`);
      // Fetch primary resume
      resumeContext =
        await this.resumeContextService.fetchPrimaryResumeContext(userId);
      // Store primary resumeId in session (if found)
      const primaryId =
        await this.resumeContextService.getPrimaryResumeId(userId);
      if (primaryId) {
        this.chatSessionManager.setSessionResumeId(userId, primaryId);
      }
    }
    const jobDescriptionRaw = await this.redisStore.getJobDescription(userId);
    const jobDescription = jobDescriptionRaw ?? undefined;
    console.log(
      `Job description for user ${userId}: ${jobDescription || "none"}`,
    );

    // Create or restart session
    if (action === InterviewAction.RESTART) {
      this.conversationStore.clearUserHistory(userId);
      return this.chatSessionManager.restartSession(
        userId,
        resumeContext,
        jobDescription,
      );
    }

    return this.chatSessionManager.createSession(
      userId,
      resumeContext,
      jobDescription,
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
  private async buildResponse(
    streamResult: StreamProcessingResult,
    action: string,
    userId: string,
  ): Promise<ChatResponse> {
    const { fullText, functionCallResult } = streamResult;

    const response: ChatResponse = {
      success: true,
      action: action,
      turn_count: await this.chatSessionManager.getSessionTurnCount(userId),
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
    await this.redisStore.clearJobDescription(userId);
  }

  /**
   * Resume an in-progress session from PostgreSQL
   * Restores conversation history to Redis and sets up the session context
   */
  async resumeSession(
    userId: string,
    userProfileId: number,
    sessionId: number,
  ): Promise<{
    success: boolean;
    message: string;
    session: any;
    messageCount: number;
  }> {
    console.log(
      `🔄 Resuming session ${sessionId} for user ${userId} (profile: ${userProfileId})`,
    );

    // 1. Get session details from PostgreSQL
    const session = await this.sessionService.getSession(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 2. Verify ownership
    if (session.user_id !== userProfileId) {
      throw new Error("You don't have access to this session");
    }

    // 3. Verify session is in_progress
    if (session.session_status !== "in_progress") {
      throw new Error(
        `Cannot resume session with status: ${session.session_status}. Only in_progress sessions can be resumed.`,
      );
    }

    // 4. Get all messages from PostgreSQL
    const messages = await this.sessionService.getSessionMessages(sessionId);

    console.log(`📝 Found ${messages.length} messages to restore`);

    // 5. Clear any existing Redis session/history for this user
    await this.clearSession(userId);

    // 6. Restore messages to Redis conversation history
    for (const msg of messages) {
      const role = msg.role === "user" ? "user" : "ai";
      await this.conversationStore.storeMessage(userId, msg.content, role);
    }

    // 7. Set job description if exists
    if (session.job_description) {
      await this.redisStore.saveJobDescription(userId, session.job_description);
      console.log(`💼 Restored job description for session ${sessionId}`);
    }

    // 8. Cache resume context
    await this.resumeContextService.fetchResumeContext(
      userId,
      session.resume_id,
    );
    console.log(
      `📋 Cached resume ${session.resume_id} for session ${sessionId}`,
    );

    // 9. Create Redis chat session (GenAI chat object will be created on next message)
    // This happens automatically in handleSession when user sends next message

    return {
      success: true,
      message: `Session ${sessionId} resumed successfully. You can now continue the conversation.`,
      session: {
        id: sessionId,
        resume_id: session.resume_id,
        job_description_id: session.job_description_id,
        status: session.session_status,
        started_at: session.started_at,
        total_questions: session.total_questions,
        questions_answered: session.questions_answered,
      },
      messageCount: messages.length,
    };
  }

  /**
   * Get session status
   */
  async getStatus(userId: string): Promise<{
    has_active_session: boolean;
    turn_count: number;
    has_history: boolean;
    has_job_description: boolean;
  }> {
    return {
      has_active_session: await this.chatSessionManager.hasSession(userId),
      turn_count: await this.chatSessionManager.getSessionTurnCount(userId),
      has_history: await this.conversationStore.hasHistory(userId),
      has_job_description: !!(await this.redisStore.getJobDescription(userId)),
    };
  }

  /**
   * Clear all data (useful for testing)
   */
  async clearAll(): Promise<void> {
    await this.chatSessionManager.clearAll();
    await this.conversationStore.clearAll();
    await this.resumeContextService.clearAll();
    await this.redisStore.clearAll();
  }

  /**
   * Helper: Get or create PostgreSQL session for tracking
   * Handles job description storage and session management
   */
  private async getOrCreatePgSession(
    userProfileId: number,
    resumeId: number,
    action?: string,
    jobDescription?: string,
    jobTitle?: string,
    companyName?: string,
  ): Promise<number> {
    // If action is START, close any existing in-progress session
    if (
      action === InterviewAction.START ||
      action === InterviewAction.RESTART
    ) {
      const activeSession =
        await this.sessionService.getActiveSession(userProfileId);
      if (activeSession) {
        console.log(
          `🔚 Completing existing session ${activeSession.id} before starting new one`,
        );
        // Mark it as abandoned (user started a new session without completing)
        await this.sessionService.updateSession(activeSession.id, {
          status: "abandoned",
        });
      }
    }

    // Save job description if provided (only saves unique ones)
    let jobDescriptionId: number | undefined;
    if (jobDescription) {
      jobDescriptionId = await this.sessionService.saveJobDescription(
        userProfileId,
        jobDescription,
        jobTitle,
        companyName,
      );
    }

    // Get or create session (reuses in_progress sessions)
    const sessionId = await this.sessionService.getOrCreateSession(
      userProfileId,
      resumeId,
      jobDescriptionId,
    );

    return sessionId;
  }
}
