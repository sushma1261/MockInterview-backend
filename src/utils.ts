import { GoogleGenerativeAI, Schema, Tool } from "@google/generative-ai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
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

// Raw Gemini client (for structured JSON output)
export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface LlmParams {
  prompt: string;
  schema: Schema;
  tools: Tool[];
}

export const llm = async (params: { prompt: string; schema: Schema }) => {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.5,
      responseMimeType: "application/json", // ✅ only here
      responseSchema: params.schema,
    },
  });

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: params.prompt }] }],
  });

  const text = response.response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
  `);
};
