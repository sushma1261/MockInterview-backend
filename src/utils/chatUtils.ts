import { GoogleGenAI } from "@google/genai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import fs from "fs/promises";
import { Pool } from "pg";
import { uploadsDir } from "../constants";
import { getDBPool } from "../db/pool";
import {
  AskNextQuestionResult,
  GenerateFeedbackResult,
  QuestionType,
  StartInterviewResult,
} from "../types/interviewTypes";
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
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY!,
    model: "text-embedding-004",
  });
};

export const fetchResumeContextFromDB = async (
  userId: string,
  userContexts: Map<string, string[]>
) => {
  if (!userContexts.has(userId)) {
    console.log("Fetching resume context for user:", userId);
    try {
      const vectorStore = await initializeVectorStore(
        getDBPool(),
        getTextEmbeddingsAPI()
      );
      const docs = await vectorStore.similaritySearch(
        "help me prepare for behavioral interview based on the resume uploaded.",
        3,
        {
          filter: { user_id: userId },
        }
      );
      userContexts.set(
        userId,
        docs.map((d) => d.pageContent)
      );
      console.log("Saved resume context, chunks:", docs.length);
    } catch (e) {
      console.error("Error fetching resume context:", e);
      userContexts.set(userId, []);
    }
  }
  console.log("Using cached resume context for user:", userId);
  return userContexts.get(userId)!;
};

export const vectorStoreTableName = "resume_chunks";

export const initializeVectorStore = async (
  pool: Pool,
  textEmbeddingsAPI: GoogleGenerativeAIEmbeddings
) => {
  return PGVectorStore.initialize(textEmbeddingsAPI, {
    pool,
    tableName: vectorStoreTableName,
    columns: {
      idColumnName: "id",
      vectorColumnName: "embedding",
      contentColumnName: "text",
      metadataColumnName: "metadata",
    },
  });
};
export const isAIDisabled = () => {
  return process.env.AI_DISABLED === "true";
};
