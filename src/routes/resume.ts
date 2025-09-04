import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { Request, Response, Router } from "express";
import fs from "fs/promises";
import multer from "multer";
import { uploadsDir } from "../constants";
import { getDBPool } from "../db/pool";
import { authenticate } from "../middleware/auth";
import {
  ensureUploadsDir,
  getTextEmbeddingsAPI,
  initializeVectorStore,
} from "../utils";

const router = Router();

// Postgres pool
const pool = getDBPool();

// Ensure uploads folder exists in project root
ensureUploadsDir();

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Upload resume and create embeddings and store in PGVectorStore
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
      console.log(`Split into chunks done. Total chunks: ${docs.length}`);

      // 2. Store directly into Postgres with PGVectorStore
      const vectorStore = await initializeVectorStore(
        pool,
        getTextEmbeddingsAPI()
      );
      await vectorStore.addDocuments(docs);

      console.log("Documents embedded & stored in PGVectorStore");

      // 3. Delete file after processing
      await fs.unlink(req.file.path);

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
