import { FunctionDeclaration, Type } from "@google/genai";

/**
 * Function declaration for starting the interview
 */
const startInterviewFuncDeclaration: FunctionDeclaration = {
  name: "start_interview",
  description: "Start the interview by asking the FIRST question.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      question: {
        type: Type.STRING,
        description: "The first interview question (behavioral or technical)",
      },
      question_type: {
        type: Type.STRING,
        description: "Type of question: 'behavioral' or 'technical'",
      },
      reasoning: {
        type: Type.STRING,
        description:
          "Brief explanation of why this question is relevant based on the resume",
      },
    },
    required: ["question", "question_type"],
  },
};

/**
 * Function declaration for asking next question
 */
const askNextQuesFuncDeclaration: FunctionDeclaration = {
  name: "ask_next_question",
  description:
    "Ask the next follow-up interview question based on candidate's previous answers or can choose to ask a new question.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      question: {
        type: Type.STRING,
        description: "The follow-up question",
      },
      question_number: {
        type: Type.NUMBER,
        description: "The sequential number of this question in the interview",
      },
      question_type: {
        type: Type.STRING,
        description:
          "Type of question: 'behavioral', 'technical', or 'clarifying'",
      },
      reasoning: {
        type: Type.STRING,
        description: "Why this follow-up question is being asked",
      },
    },
    required: ["question", "question_number", "question_type"],
  },
};

/**
 * Function declaration for generating feedback
 */
const generateFeedbackFuncDeclaration: FunctionDeclaration = {
  name: "generate_feedback",
  description:
    "Generate interview feedback. Call this when you have gathered enough information (typically after 3-5 questions) or when explicitly requested.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      confidence_score: {
        type: Type.NUMBER,
        description: "Overall confidence score from 1-10",
      },
      grammar_assessment: {
        type: Type.STRING,
        description: "Assessment of communication and grammar skills",
      },
      content_quality: {
        type: Type.STRING,
        description: "Assessment of answer depth and relevance",
      },
      improvement_suggestions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Specific suggestions for improvement",
      },
      strengths: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "What the candidate did well",
      },
      is_final: {
        type: Type.BOOLEAN,
        description: "Whether this is the final feedback for the interview",
      },
    },
    required: [
      "confidence_score",
      "grammar_assessment",
      "content_quality",
      "improvement_suggestions",
      "strengths",
      "is_final",
    ],
  },
};

/**
 * Combined tools configuration for GenAI
 */
const interviewTools = [
  {
    functionDeclarations: [
      startInterviewFuncDeclaration,
      askNextQuesFuncDeclaration,
      generateFeedbackFuncDeclaration,
    ],
  },
];

/**
 * Get tool configuration object
 */
export function getToolConfig() {
  return {
    tools: interviewTools,
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO" as const,
      },
    },
  };
}
