import { InterviewAction } from "../types/interviewTypes";

/**
 * Builds prompts for different interview scenarios
 */
export class PromptBuilder {
  /**
   * Build prompt for starting a new interview
   */
  public static buildStartPrompt(): string {
    return "Please start the interview by asking the FIRST question. Use the 'start_interview' function with a question relevant to the candidate's background or based on the job description if provided.";
  }

  /**
   * Build prompt for continuing the interview with candidate's answer
   */
  public static buildContinuePrompt(
    conversationHistory: string,
    candidateAnswer: string,
    questionNumber?: number
  ): string {
    return `
      CONVERSATION HISTORY:
      ${conversationHistory}

      CANDIDATE'S ANSWER${
        questionNumber ? ` (Question #${questionNumber})` : ""
      }:
      ${candidateAnswer}

      IMPORTANT: When asking the next question, you MUST provide feedback on the candidate's previous answer in the 'previous_answer_feedback' field.
      
      Based on this answer, decide whether to:
      1. Use 'ask_next_question' with feedback on current answer + next question (if continuing interview)
      2. Use 'generate_feedback' for final overall interview feedback (after 3-5 questions or when requested)
      
      Be intelligent about your choice - aim for 3-5 questions total, but also ensure comprehensive coverage.`;
  }

  /**
   * Build prompt for requesting feedback
   */
  public static buildFeedbackPrompt(conversationHistory: string): string {
    return `
      CONVERSATION SO FAR:
      ${conversationHistory}

      The candidate has requested feedback or wants to end the interview. Please provide comprehensive feedback using the 'generate_feedback' function. Set 'is_final' to true.`;
  }

  /**
   * Build prompt for skipping current question
   */
  public static buildSkipPrompt(conversationHistory: string): string {
    return `
      CONVERSATION SO FAR:
      ${conversationHistory}

      The candidate wants to skip the current question. Acknowledge this politely and ask the next question using 'ask_next_question'. You can leave the feedback fields empty or minimal since the question was skipped.`;
  }

  public static buildNoAnswerPrompt(conversationHistory: string): string {
    return `
      CONVERSATION SO FAR:
      ${conversationHistory}

      The candidate did not provide an answer. Ask the next question using 'ask_next_question'.`;
  }

  /**
   * Build prompt based on action type
   */
  public static buildPrompt(
    action: InterviewAction | string,
    conversationHistory: string = "",
    candidateAnswer: string = "",
    questionNumber?: number
  ): string {
    switch (action) {
      case InterviewAction.START:
      case InterviewAction.RESTART:
        return this.buildStartPrompt();

      case InterviewAction.FEEDBACK:
      case InterviewAction.END:
        return this.buildFeedbackPrompt(conversationHistory);

      case InterviewAction.SKIP:
        return this.buildSkipPrompt(conversationHistory);

      case InterviewAction.NO_ANSWER:
        return this.buildNoAnswerPrompt(conversationHistory);

      case InterviewAction.CONTINUE:
      default:
        return this.buildContinuePrompt(
          conversationHistory,
          candidateAnswer,
          questionNumber
        );
    }
  }

  public static buildSystemPrompt({
    resumeContext,
    jobDescription,
  }: {
    resumeContext: string;
    jobDescription?: string;
  }): string {
    console.log(
      `Building system prompt. Job description provided: ${!!jobDescription}`
    );
    return `You are an experienced interviewer conducting a behavioral and technical interview.

        CANDIDATE'S RESUME CONTEXT:
        ${resumeContext}

        JOB DESCRIPTION:
        ${jobDescription}

        YOUR ROLE:
        - Conduct a professional interview based on the candidate's resume and the job description (if provided)
        - Ask relevant behavioral and technical questions
        - Provide constructive feedback on their answers at end
        - Be encouraging but honest in your assessment

        INTERVIEW FLOW:
        1. Start interview: use start_interview function (first question only)
        2. Continue interview: use ask_next_question function WITH feedback on previous answer
        3. End interview: use generate_feedback function after 3-5 questions, or when requested by user

        CRITICAL REQUIREMENT:
        - When using 'ask_next_question', you MUST fill in 'previous_answer_feedback' with feedback on the candidate's last answer
        - This includes: feedback_text, strengths, areas_for_improvement, and score (0-10)
        - This allows us to track feedback for each question individually

        GUIDELINES:
        - Tailor questions to the candidate's background and experience level
        - Ask one question at a time
        - Look for STAR method in behavioral answers (Situation, Task, Action, Result)
        - Ask 3-5 questions total and then provide final feedback

        IMPORTANT:
        - Always use the provided functions to structure your responses
        - Be specific in your feedback with actionable suggestions
        - Acknowledge good answers and areas of strength
        - Set is_final to true only when giving final comprehensive feedback`;
  }
}
