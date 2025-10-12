import { InterviewAction } from "../types/types";

/**
 * Builds prompts for different interview scenarios
 */
export class PromptBuilder {
  /**
   * Build prompt for starting a new interview
   */
  public static buildStartPrompt(): string {
    return "Please start the interview by asking the FIRST question. Use the 'start_interview' function with a question relevant to the candidate's background.";
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

CANDIDATE'S ANSWER${questionNumber ? ` (Question #${questionNumber})` : ""}:
${candidateAnswer}

Based on this answer, decide whether to:
1. Ask a follow-up question using 'ask_next_question' (if the answer needs more depth or clarification)
2. Provide feedback using 'generate_feedback' (if you have enough information after 3-5 questions)

Be intelligent about your choice - don't ask too many questions, but also don't end too early.`;
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

The candidate wants to skip the current question. Ask the next question using 'ask_next_question'.`;
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

      case InterviewAction.CONTINUE:
      default:
        return this.buildContinuePrompt(
          conversationHistory,
          candidateAnswer,
          questionNumber
        );
    }
  }

  /**
   * Format conversation history for display
   */
  public static formatConversationHistory(history: string): string {
    if (!history || history.trim().length === 0) {
      return "No previous conversation.";
    }
    return history;
  }
}
