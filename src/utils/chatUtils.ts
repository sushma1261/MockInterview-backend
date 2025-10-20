import { GoogleGenAI } from "@google/genai";
import { Embeddings } from "@langchain/core/embeddings";
import fs from "fs/promises";
import { uploadsDir } from "../constants";
import {
  AskNextQuestionResult,
  GenerateFeedbackResult,
  QuestionType,
  StartInterviewResult,
} from "../types/interviewTypes";

/**
 * Custom embeddings implementation using Google GenAI SDK
 * This works around issues with GoogleGenerativeAIEmbeddings
 */
class CustomGoogleGenAIEmbeddings extends Embeddings {
  private genai: GoogleGenAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    super({});
    this.genai = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches to avoid rate limits
    for (const text of texts) {
      const embedding = await this.embedQuery(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    try {
      const result = await this.genai.models.embedContent({
        model: this.modelName,
        contents: text,
        config: {
          outputDimensionality: 768, // Force 768 dimensions instead of default 3072
        },
      });

      if (!result.embeddings || result.embeddings.length === 0) {
        throw new Error(
          `No embeddings returned for text: ${text.substring(0, 50)}...`
        );
      }

      const embedding = result.embeddings[0];
      if (!embedding.values || embedding.values.length === 0) {
        throw new Error(
          `Empty embedding values for text: ${text.substring(0, 50)}...`
        );
      }

      return embedding.values;
    } catch (error) {
      console.error("Embedding generation error:", error);
      throw error;
    }
  }
}

export const getGenAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function ensureUploadsDir() {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (err) {
    console.error("Error ensuring uploads dir:", err);
  }
}

export const chatHandlers = {
  start_interview: async (args: {
    question: string;
    question_type: QuestionType;
    reasoning: string;
  }): Promise<StartInterviewResult> => {
    return {
      type: "start_interview",
      question_number: 1,
      ...args,
    };
  },

  ask_next_question: async (args: {
    question: string;
    question_number: number;
    question_type: QuestionType;
    reasoning: string;
  }): Promise<AskNextQuestionResult> => {
    return {
      type: "ask_next_question",
      ...args,
    };
  },

  generate_feedback: async (args: {
    confidence_score: number;
    grammar_assessment: string;
    content_quality: string;
    improvement_suggestions: string[];
    strengths: string[];
    is_final: boolean;
  }): Promise<GenerateFeedbackResult> => {
    return {
      type: "generate_feedback",
      ...args,
    };
  },
};

export const getTextEmbeddingsAPI = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Use custom GoogleGenAI implementation with gemini-embedding-001 (768 dimensions)
  return new CustomGoogleGenAIEmbeddings(
    process.env.GEMINI_API_KEY,
    "gemini-embedding-001"
  );
};

export const isAIDisabled = () => {
  return process.env.AI_DISABLED === "true";
};
