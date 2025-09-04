import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import fs from "fs/promises";
import { Pool } from "pg";
import { uploadsDir } from "./constants";

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
