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
          "Brief explanation of why this question is relevant based on the resume and job description also tell if you recieved a job description or not",
      },
    },
    required: ["question", "question_type"],
  },
};

/**
 * Function declaration for asking next question with feedback on previous answer
 */
const askNextQuesFuncDeclaration: FunctionDeclaration = {
  name: "ask_next_question",
  description:
    "Provide feedback on the candidate's previous answer AND ask the next interview question. This combines evaluation and progression in one call.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      // Feedback for the previous answer
      previous_answer_feedback: {
        type: Type.OBJECT,
        description: "Feedback for the answer just provided by the candidate",
        properties: {
          feedback_text: {
            type: Type.STRING,
            description: "Brief constructive feedback on the answer",
          },
          strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Positive aspects of the answer (1-3 points)",
          },
          areas_for_improvement: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Areas that could be improved (1-3 points)",
          },
          score: {
            type: Type.NUMBER,
            description: "Score from 0-10 for the answer quality",
          },
        },
      },
      // Next question details
      question: {
        type: Type.STRING,
        description: "The next interview question",
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
    required: [
      "previous_answer_feedback",
      "question",
      "question_number",
      "question_type",
    ],
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
