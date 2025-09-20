import { SchemaType, Tool } from "@google/generative-ai";

// Tool 1: Ask next question
const askNextQuestion: Tool = {
  functionDeclarations: [
    {
      name: "ask_next_question",
      description:
        "Ask the next interview question based on candidate's answers and resume. Also give question number.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.STRING },
        },
        required: ["question"],
      },
    },
  ],
};

// Tool 2: Generate feedback
const generateFeedback: Tool = {
  functionDeclarations: [
    {
      name: "generate_feedback",
      description:
        "Generate structured interview feedback based on answers so far.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          confidence_score: { type: SchemaType.NUMBER },
          grammar_assessment: { type: SchemaType.STRING },
          content_quality: { type: SchemaType.STRING },
          improvement_suggestions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: [
          "confidence_score",
          "grammar_assessment",
          "content_quality",
          "improvement_suggestions",
        ],
      },
    },
  ],
};

export const tools: Tool[] = [askNextQuestion, generateFeedback];

// --- HANDLERS ---
export const handlers = {
  ask_next_question: async (args: { question: string }) => {
    return {
      question: args.question,
      type: "next_question",
    };
  },

  generate_feedback: async (args: {
    confidence_score: number;
    grammar_assessment: string;
    content_quality: string;
    improvement_suggestions: string[];
  }) => {
    return {
      confidence_score: args.confidence_score,
      grammar_assessment: args.grammar_assessment,
      content_quality: args.content_quality,
      improvement_suggestions: args.improvement_suggestions,
      type: "feedback",
    };
  },
};
