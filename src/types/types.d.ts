type StartInterviewResult = {
  type: "start_interview";
  question: string;
  question_type: string;
  reasoning: string;
  question_number: number;
};

type AskNextQuestionResult = {
  type: "ask_next_question";
  question: string;
  question_number: number;
  question_type: string;
  reasoning: string;
};

type GenerateFeedbackResult = {
  type: "generate_feedback";
  confidence_score: number;
  grammar_assessment: string;
  content_quality: string;
  improvement_suggestions: string[];
  strengths: string[];
  is_final: boolean;
};

type FunctionCallResult =
  | StartInterviewResult
  | AskNextQuestionResult
  | GenerateFeedbackResult;
