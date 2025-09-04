import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Pool } from "pg";

const pool = new Pool({
  host: "localhost", // or docker service name if running in compose
  port: 5432,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
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
