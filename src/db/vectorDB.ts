import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Pool } from "pg";

// Postgres pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Render requires SSL
  },
});

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: "text-embedding-004",
  apiKey: process.env.GEMINI_API_KEY!,
});

export const vectorStorePromise = (async () => {
  return await PGVectorStore.initialize(embeddings, {
    pool,
    tableName: "resume_chunks",
  });
})();
