import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { Request, Response, Router } from "express";
import multer from "multer";
import { Pool } from "pg";
import { authenticate } from "../middleware/auth";

const router = Router();

// Postgres pool
const pool = new Pool({
  host: "localhost", // adjust if needed (e.g., docker service name)
  port: 5432,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

// Embeddings model (Gemini)
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GEMINI_API_KEY!,
  model: "text-embedding-004",
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Upload resume and create embeddings
router.post(
  "/upload/pdf",
  authenticate,
  upload.single("resume"),
  async (req: Request, res: Response) => {
    console.log("File received:", req.file);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // 1. Load & split resume
      const loader = new PDFLoader(req.file.path);
      const rawDocs = await loader.load();

      const splitter = new CharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
      });
      const docs = await splitter.splitDocuments(rawDocs);

      // 2. Store directly into Postgres with PGVectorStore
      const vectorStore = await PGVectorStore.initialize(embeddings, {
        pool,
        tableName: "resume_chunks",
        columns: {
          idColumnName: "id",
          vectorColumnName: "embedding",
          contentColumnName: "text",
          metadataColumnName: undefined, // 👈 disables metadata
        },
      });
      await vectorStore.addDocuments(docs);

      res.json({
        message: "Resume uploaded & embedded with Gemini successfully",
        chunks: docs.length,
      });
    } catch (err) {
      console.error("Error processing resume:", err);
      res.status(500).json({ error: "Failed to process resume" });
    }
  }
);

export default router;
