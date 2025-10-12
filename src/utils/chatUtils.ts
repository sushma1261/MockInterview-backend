import { GoogleGenAI } from "@google/genai";
import { getDBPool } from "../db/pool";
import { getTextEmbeddingsAPI, initializeVectorStore } from "./utils";

export const getGenAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export const chatHandlers = {
  start_interview: async (args: {
    question: string;
    question_type: string;
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
    question_type: string;
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

// ---------------- Resume Context ----------------
export const fetchResumeContext = async (
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
