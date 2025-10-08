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
  isAIDisabled,
} from "../utils/utils";

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

router.post(
  "/upload/pdf",
  authenticate,
  upload.single("resume"),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "No user ID" });
    console.log("File received from user:", userId, req.file);
    if (isAIDisabled()) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return res.json({
        message: "AI features are disabled. Upload skipped.",
        chunks: 0,
      });
    }

    try {
      const loader = new PDFLoader(req.file.path);
      const rawDocs = await loader.load();

      const splitter = new CharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
      });
      const docs = await splitter.splitDocuments(rawDocs);
      // Attach metadata to docs before embedding
      const docsWithUserId = docs.map((doc) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          user_id: userId,
        },
      }));

      const vectorStore = await initializeVectorStore(
        pool,
        getTextEmbeddingsAPI()
      );
      await vectorStore.addDocuments(docsWithUserId);

      await fs.unlink(req.file.path);

      res.json({
        message: "Resume uploaded & embedded successfully",
        chunks: docs.length,
      });
    } catch (err) {
      console.error("Error processing resume:", err);
      res.status(500).json({ error: "Failed to process resume" });
    }
  }
);

export default router;
