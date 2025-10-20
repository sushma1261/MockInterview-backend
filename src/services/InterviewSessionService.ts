import { Pool } from "pg";

/**
 * Service for managing interview sessions and chat history in PostgreSQL
 * Provides persistent storage for complete interview sessions with resume and job description mapping
 */
export class InterviewSessionService {
  private static instance: InterviewSessionService;
  private pool: Pool;

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get singleton instance
   */
  public static getInstance(pool?: Pool): InterviewSessionService {
    if (!InterviewSessionService.instance) {
      if (!pool) {
        throw new Error("Pool required for first getInstance call");
      }
      InterviewSessionService.instance = new InterviewSessionService(pool);
    }
    return InterviewSessionService.instance;
  }

  // ============================================================================
  // JOB DESCRIPTIONS
  // ============================================================================

  /**
   * Save or get existing job description
   * Returns the job_description_id
   */
  async saveJobDescription(
    userId: number,
    jobDescription: string,
    title?: string,
    companyName?: string
  ): Promise<number> {
    // Check if this exact job description already exists for the user
    const existing = await this.pool.query(
      `SELECT id FROM job_descriptions 
       WHERE user_id = $1 AND description = $2`,
      [userId, jobDescription]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    // Create new job description
    const result = await this.pool.query(
      `INSERT INTO job_descriptions (user_id, title, company_name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, title || "Untitled Position", companyName, jobDescription]
    );

    return result.rows[0].id;
  }

  /**
   * Get all job descriptions for a user
   */
  async getUserJobDescriptions(userId: number): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT id, title, company_name, description, created_at, updated_at
       FROM job_descriptions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  // ============================================================================
  // INTERVIEW SESSIONS
  // ============================================================================

  /**
   * Create a new interview session
   * Returns the session_id
   */
  async createSession(
    userId: number,
    resumeId: number,
    jobDescriptionId?: number
  ): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO interview_sessions (user_id, resume_id, job_description_id, session_status)
       VALUES ($1, $2, $3, 'in_progress')
       RETURNING id`,
      [userId, resumeId, jobDescriptionId]
    );

    console.log(
      `📝 Created interview session ${result.rows[0].id} for user ${userId}, resume ${resumeId}`
    );

    return result.rows[0].id;
  }

  /**
   * Get or create active session for user + resume + job description
   * Checks if there's an in_progress session with the same combination
   */
  async getOrCreateSession(
    userId: number,
    resumeId: number,
    jobDescriptionId?: number
  ): Promise<number> {
    // Check for existing in_progress session
    const existing = await this.pool.query(
      `SELECT id FROM interview_sessions
       WHERE user_id = $1 
         AND resume_id = $2 
         AND ($3::INTEGER IS NULL OR job_description_id = $3)
         AND session_status = 'in_progress'
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId, resumeId, jobDescriptionId]
    );

    if (existing.rows.length > 0) {
      console.log(`♻️ Reusing existing session ${existing.rows[0].id}`);
      return existing.rows[0].id;
    }

    // Create new session
    return await this.createSession(userId, resumeId, jobDescriptionId);
  }

  /**
   * Update session status and metadata
   */
  async updateSession(
    sessionId: number,
    updates: {
      status?: "in_progress" | "completed" | "abandoned";
      totalQuestions?: number;
      questionsAnswered?: number;
      overallFeedback?: any;
    }
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.status) {
      fields.push(`session_status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (updates.totalQuestions !== undefined) {
      fields.push(`total_questions = $${paramIndex++}`);
      values.push(updates.totalQuestions);
    }

    if (updates.questionsAnswered !== undefined) {
      fields.push(`questions_answered = $${paramIndex++}`);
      values.push(updates.questionsAnswered);
    }

    if (updates.overallFeedback) {
      fields.push(`overall_feedback = $${paramIndex++}`);
      values.push(JSON.stringify(updates.overallFeedback));
    }

    if (fields.length === 0) return;

    values.push(sessionId);

    await this.pool.query(
      `UPDATE interview_sessions
       SET ${fields.join(", ")}
       WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Mark session as completed
   */
  async completeSession(
    sessionId: number,
    overallFeedback?: any
  ): Promise<void> {
    await this.updateSession(sessionId, {
      status: "completed",
      overallFeedback,
    });

    console.log(`✅ Completed interview session ${sessionId}`);
  }

  /**
   * Get active (in_progress) session for a user
   * Returns the most recent in_progress session
   */
  async getActiveSession(userId: number): Promise<{
    id: number;
    resume_id: number;
    job_description_id?: number;
  } | null> {
    const result = await this.pool.query(
      `SELECT id, resume_id, job_description_id
       FROM interview_sessions
       WHERE user_id = $1 
         AND session_status = 'in_progress'
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get session details
   */
  async getSession(sessionId: number): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT 
        s.*,
        r.title AS resume_title,
        r.file_name AS resume_file_name,
        jd.title AS job_title,
        jd.company_name,
        jd.description AS job_description
       FROM interview_sessions s
       JOIN resumes r ON s.resume_id = r.id
       LEFT JOIN job_descriptions jd ON s.job_description_id = jd.id
       WHERE s.id = $1`,
      [sessionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(
    userId: number,
    options?: {
      resumeId?: number;
      status?: string;
      limit?: number;
    }
  ): Promise<any[]> {
    let query = `
      SELECT 
        s.id,
        s.resume_id,
        s.job_description_id,
        s.session_status,
        s.total_questions,
        s.questions_answered,
        s.started_at,
        s.completed_at,
        s.duration_minutes,
        r.title AS resume_title,
        jd.title AS job_title,
        jd.company_name,
        COUNT(DISTINCT cm.id) AS message_count
      FROM interview_sessions s
      JOIN resumes r ON s.resume_id = r.id
      LEFT JOIN job_descriptions jd ON s.job_description_id = jd.id
      LEFT JOIN chat_messages cm ON s.id = cm.session_id
      WHERE s.user_id = $1
    `;

    const params: any[] = [userId];
    let paramIndex = 2;

    if (options?.resumeId) {
      query += ` AND s.resume_id = $${paramIndex++}`;
      params.push(options.resumeId);
    }

    if (options?.status) {
      query += ` AND s.session_status = $${paramIndex++}`;
      params.push(options.status);
    }

    query += `
      GROUP BY s.id, r.title, jd.title, jd.company_name
      ORDER BY s.started_at DESC
    `;

    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
    }

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================================================
  // CHAT MESSAGES
  // ============================================================================

  /**
   * Save a chat message
   */
  async saveMessage(
    sessionId: number,
    role: "user" | "assistant",
    content: string,
    metadata?: {
      messageType?: string;
      questionNumber?: number;
      questionType?: string;
      functionName?: string;
      functionResult?: any;
    }
  ): Promise<number> {
    console.log(
      `💬 Saving ${role} message to session ${sessionId}:`,
      content.substring(0, 100) + "..."
    );
    console.log("metadata:::", metadata);
    const result = await this.pool.query(
      `INSERT INTO chat_messages 
       (session_id, role, content, message_type, question_number, question_type, function_name, function_result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        sessionId,
        role,
        content,
        metadata?.messageType || null,
        metadata?.questionNumber || null,
        metadata?.questionType || null,
        metadata?.functionName || null,
        metadata?.functionResult
          ? JSON.stringify(metadata.functionResult)
          : null,
      ]
    );

    const messageId = result.rows[0].id;
    console.log(
      `✅ Saved ${role} message with ID ${messageId} (type: ${
        metadata?.messageType || "text"
      })`
    );

    return messageId;
  }

  /**
   * Get all messages for a session
   */
  async getSessionMessages(sessionId: number): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        id,
        role,
        content,
        message_type,
        question_number,
        question_type,
        function_name,
        function_result,
        created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    return result.rows;
  }

  /**
   * Get conversation history as formatted string
   */
  async getConversationHistory(
    sessionId: number,
    limit?: number
  ): Promise<string> {
    let query = `
      SELECT role, content, created_at
      FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
    `;

    if (limit) {
      query += ` LIMIT $2`;
    }

    const result = await this.pool.query(
      query,
      limit ? [sessionId, limit] : [sessionId]
    );

    return result.rows
      .map(
        (row) => `${row.role === "user" ? "User" : "Assistant"}: ${row.content}`
      )
      .join("\n\n");
  }

  // ============================================================================
  // QUESTION FEEDBACK
  // ============================================================================

  /**
   * Save feedback for a question
   */
  async saveFeedback(
    sessionId: number,
    questionNumber: number,
    questionText: string,
    userAnswer: string,
    feedback: {
      feedbackText?: string;
      strengths?: string[];
      areasForImprovement?: string[];
      score?: number;
      questionType?: string;
    }
  ): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO question_feedback 
       (session_id, question_number, question_text, user_answer, question_type, 
        feedback_text, strengths, areas_for_improvement, score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        sessionId,
        questionNumber,
        questionText,
        userAnswer,
        feedback.questionType || null,
        feedback.feedbackText || null,
        feedback.strengths || null,
        feedback.areasForImprovement || null,
        feedback.score || null,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Get all feedback for a session
   */
  async getSessionFeedback(sessionId: number): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM question_feedback
       WHERE session_id = $1
       ORDER BY question_number ASC`,
      [sessionId]
    );

    return result.rows;
  }

  // ============================================================================
  // STATISTICS & ANALYTICS
  // ============================================================================

  /**
   * Get user statistics
   */
  async getUserStats(userId: number): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        COUNT(DISTINCT s.id) AS total_sessions,
        COUNT(DISTINCT CASE WHEN s.session_status = 'completed' THEN s.id END) AS completed_sessions,
        COUNT(DISTINCT s.resume_id) AS resumes_practiced,
        COUNT(DISTINCT s.job_description_id) AS job_descriptions_used,
        SUM(s.total_questions) AS total_questions,
        SUM(s.questions_answered) AS total_answers,
        AVG(s.duration_minutes) AS avg_duration_minutes,
        AVG(qf.score) AS avg_score
       FROM interview_sessions s
       LEFT JOIN question_feedback qf ON s.id = qf.session_id
       WHERE s.user_id = $1`,
      [userId]
    );

    return result.rows[0];
  }
}
