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

// Types for interview functionality

export enum InterviewAction {
  START = "start",
  RESTART = "restart",
  CONTINUE = "continue",
  FEEDBACK = "feedback",
  END = "end",
  SKIP = "skip",
}

export enum QuestionType {
  BEHAVIORAL = "behavioral",
  TECHNICAL = "technical",
  CLARIFYING = "clarifying",
}

export interface ConversationTurn {
  role: "user" | "ai";
  content: string;
  timestamp?: Date;
}

export interface StartInterviewResult {
  type: "start_interview";
  question: string;
  question_type: QuestionType;
  question_number: number;
  reasoning?: string;
}

export interface AskNextQuestionResult {
  type: "ask_next_question";
  question: string;
  question_number: number;
  question_type: QuestionType;
  reasoning?: string;
}

export interface GenerateFeedbackResult {
  type: "generate_feedback";
  confidence_score: number;
  grammar_assessment: string;
  content_quality: string;
  improvement_suggestions: string[];
  strengths: string[];
  is_final: boolean;
}

export type FunctionCallResult =
  | StartInterviewResult
  | AskNextQuestionResult
  | GenerateFeedbackResult;

export interface ChatRequest {
  message?: string;
  action?: InterviewAction;
  question_number?: number;
}

export interface ChatResponse {
  success: boolean;
  action: string;
  type?: string;
  data?: FunctionCallResult;
  question?: string;
  question_number?: number;
  question_type?: string;
  reasoning?: string;
  feedback?: GenerateFeedbackResult;
  is_complete?: boolean;
  context?: string;
  turn_count?: number;
}

export interface StreamProcessingResult {
  fullText: string;
  functionCallResult: FunctionCallResult | null;
}

export interface ChatSessionConfig {
  model: string;
  temperature: number;
  systemInstruction: string;
  maxOutputTokens: number;
  tools: any[];
  toolConfig: any;
}
