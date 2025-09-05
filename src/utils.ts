import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import fs from "fs/promises";
import { Pool } from "pg";
import { INTERVIEW_SYSTEM_PROMPT, uploadsDir } from "./constants";

export async function ensureUploadsDir() {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (err) {
    console.error("Error ensuring uploads dir:", err);
  }
}

// Text Embeddings model (Gemini)
export const getTextEmbeddingsAPI = () => {
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY!,
    model: "text-embedding-004",
  });
};
export const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
  model: "gemini-2.5-flash",
  temperature: 0.5,
});

export const vectorStoreTableName = "resume_chunks";

export const initializeVectorStore = async (
  pool: Pool,
  textEmbeddingsAPI: GoogleGenerativeAIEmbeddings
) => {
  return PGVectorStore.initialize(textEmbeddingsAPI, {
    // chore: Common config so not updating we should update it later
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

export const getInterviewPrompt = () => {
  return ChatPromptTemplate.fromMessages([
    [
      "system",
      `${INTERVIEW_SYSTEM_PROMPT}\n\nResume context:\n{context}\n\nRelevant conversation:\n{conversation_history}`,
    ],
    ["human", "{conversation}"],
  ]);
};

export const getFeedbackPrompt = () => {
  return PromptTemplate.fromTemplate(`
  You are a professional interview coach. 
  Analyze the following interview transcript and give relevant feedback to user.
  Resume context:
  {context}
  Transcript:
  {conversation_history}
  Provide structured feedback:
  1. Confidence score (1-10)
  2. Grammar assessment
  3. Content quality
  4. Three improvement suggestions
  `);
};
