import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { Request, Response, Router } from "express";
import { promises as fs } from "fs";
import multer from "multer";
import redisClient from "../config/redis";
import { uploadsDir } from "../constants";
import { getDBPool } from "../db/pool";
import { authenticate } from "../middleware/auth";
import { ResumeChunkService } from "../services/ResumeChunkService";
import { ResumeService } from "../services/ResumeService";
import { UserProfileService } from "../services/UserProfileService";

import {
  ensureUploadsDir,
  getTextEmbeddingsAPI,
  initializeVectorStore,
} from "../utils/chatUtils";

const router = Router();

// Postgres pool
const pool = getDBPool();

// Initialize services
const userProfileService = new UserProfileService(pool, redisClient);
const resumeService = new ResumeService(pool, redisClient);
const resumeChunkService = new ResumeChunkService(pool);

async function embedResumeDocuments(
  docsWithMetadata: any[],
  resumeId: number
): Promise<number> {
  console.log(
    `📦 Processing ${docsWithMetadata.length} chunks for resume ${resumeId}...`
  );

  const embeddingsAPI = getTextEmbeddingsAPI();

  // Initialize vector store with the embeddings API
  console.log("🔧 Initializing PGVectorStore...");
  const vectorStore = await initializeVectorStore(pool, embeddingsAPI);

  // Process and embed each chunk
  // The vectorStore.addDocuments() will internally:
  // 1. Call embeddingsAPI.embedDocuments() for all chunks
  // 2. Generate a 768-dimension vector for each chunk
  // 3. Insert each chunk with its embedding into resume_chunks table
  console.log(
    `🔄 Generating embeddings and storing ${docsWithMetadata.length} chunks...`
  );

  await vectorStore.addDocuments(docsWithMetadata);

  console.log(
    `✅ Successfully embedded and stored ${docsWithMetadata.length} chunks for resume ${resumeId}`
  );

  return docsWithMetadata.length;
}

// Ensure uploads folder exists
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

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * Upload resume and save to both PostgreSQL and vector store
 * POST /api/user/resumes/upload
 */
router.post(
  "/upload",
  authenticate,
  upload.single("resume"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: "No user ID" });
    }

    console.log("Resume upload from user:", userId, req.file.originalname);

    try {
      // Get or create user profile to get the internal user ID
      const userProfile = await userProfileService.getOrCreateUserProfile(
        userId,
        req.user?.email || "",
        req.user?.name,
        req.user?.picture
      );

      // Check if resume with same filename already exists
      const fileExists = await resumeService.resumeExistsByFileName(
        userProfile.id,
        req.file.originalname
      );

      if (fileExists) {
        return res.status(409).json({
          error: "A resume with this filename already exists",
          message: `You already have a resume named "${req.file.originalname}". Please rename the file or delete the existing resume first.`,
          file_name: req.file.originalname,
        });
      }

      // Extract text content from PDF
      const loader = new PDFLoader(req.file.path);
      const rawDocs = await loader.load();
      const fullText = rawDocs.map((doc) => doc.pageContent).join("\n");

      // Read PDF binary data
      const pdfBuffer = await fs.readFile(req.file.path);

      // Create resume record in database
      const resumeTitle =
        req.body.title || req.file.originalname.replace(".pdf", "");
      const isPrimary =
        req.body.is_primary === "true" || req.body.is_primary === true;

      // TODO: Remove this
      // Option to store in DB or keep on disk (controlled by query parameter)
      const storeInDB =
        req.body.store_in_db === "true" || req.body.store_in_db === true;

      const resume = await resumeService.createResume(userProfile.id, {
        title: resumeTitle,
        file_name: req.file.originalname,
        file_path: storeInDB ? undefined : req.file.path, // Only store path if not storing in DB
        file_size: req.file.size,
        content: fullText,
        file_data: storeInDB ? pdfBuffer : undefined, // Store binary data if requested
        is_primary: isPrimary,
      });

      console.log(
        `✅ Resume saved to database with ID: ${resume.id} (stored in DB: ${storeInDB})`
      );

      // Process for vector embeddings
      const splitter = new CharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
      });
      const docs = await splitter.splitDocuments(rawDocs);

      console.log(`📄 Split resume into ${docs.length} chunks`);

      // Filter out empty documents
      const validDocs = docs.filter(
        (doc) => doc.pageContent && doc.pageContent.trim().length > 0
      );

      if (validDocs.length === 0) {
        console.warn("⚠️ No valid text chunks found in PDF");
        return res.status(400).json({
          error:
            "Could not extract text from PDF. Please ensure the PDF contains readable text.",
        });
      }

      console.log(
        `✅ ${validDocs.length} valid chunks after filtering empty ones`
      );

      // Attach metadata to docs before embedding (including chunk index)
      const docsWithMetadata = validDocs.map((doc, index) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          user_id: userId,
          resume_id: resume.id, // Link to the resume record
          chunk_index: index, // Track the order of chunks
          file_name: req.file!.originalname,
        },
      }));

      // Process and embed documents into vector store
      // This will create one embedding per chunk
      const embeddedCount = await embedResumeDocuments(
        docsWithMetadata,
        resume.id
      );

      // Verify chunks were stored correctly
      // const chunkCount = await resumeChunkService.getChunkCount(resume.id);
      // console.log(`✅ Verified ${chunkCount} chunks stored in database`);

      // // Get user's total chunk statistics
      // const stats = await resumeChunkService.getUserChunkStats(userProfile.id);
      // console.log(
      //   `📊 User stats: ${stats.total_chunks} total chunks across ${stats.resumes_with_chunks} resumes`
      // );

      res.status(201).json({
        message: "Resume uploaded and embedded successfully",
        resume: {
          id: resume.id,
          title: resume.title,
          file_name: resume.file_name,
          is_primary: resume.is_primary,
          created_at: resume.created_at,
        },
        embeddings_created: true,
        chunks: embeddedCount,
        // user_stats: {
        //   total_chunks: stats.total_chunks,
        //   total_resumes_with_chunks: stats.resumes_with_chunks,
        //   avg_chunks_per_resume:
        //     Math.round(stats.avg_chunks_per_resume * 10) / 10,
        // },
      });
    } catch (err) {
      console.error("Error processing resume:", err);

      // More specific error messages
      if (err instanceof Error) {
        if (err.message.includes("PDF")) {
          return res.status(400).json({ error: "Invalid PDF file" });
        }
      }

      res.status(500).json({ error: "Failed to process resume" });
    }
  }
);

/**
 * Get chunks for a specific resume
 * GET /api/user/resumes/:id/chunks
 */
router.get("/:id/chunks", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: "No user ID" });
    }

    const resumeId = parseInt(req.params.id);
    if (isNaN(resumeId)) {
      return res.status(400).json({ error: "Invalid resume ID" });
    }

    // Get user profile
    const userProfile = await userProfileService.getOrCreateUserProfile(
      userId,
      req.user?.email || "",
      req.user?.name,
      req.user?.picture
    );

    // Verify resume belongs to user
    const resume = await resumeService.getResumeById(resumeId, userProfile.id);
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    // Get chunks
    const chunks = await resumeChunkService.getChunksByResumeId(resumeId);
    const chunkCount = chunks.length;

    res.json({
      resume_id: resumeId,
      resume_title: resume.title,
      chunk_count: chunkCount,
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        chunk_index: chunk.chunk_index,
        text_preview: chunk.text.substring(0, 100) + "...",
        text_length: chunk.text.length,
        metadata: chunk.metadata,
        created_at: chunk.created_at,
      })),
    });
  } catch (err) {
    console.error("Error getting resume chunks:", err);
    res.status(500).json({ error: "Failed to get resume chunks" });
  }
});

/**
 * Get full text reconstruction of a resume
 * GET /api/user/resumes/:id/fulltext
 */
router.get(
  "/:id/fulltext",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ error: "No user ID" });
      }

      const resumeId = parseInt(req.params.id);
      if (isNaN(resumeId)) {
        return res.status(400).json({ error: "Invalid resume ID" });
      }

      // Get user profile
      const userProfile = await userProfileService.getOrCreateUserProfile(
        userId,
        req.user?.email || "",
        req.user?.name,
        req.user?.picture
      );

      // Verify resume belongs to user
      const resume = await resumeService.getResumeById(
        resumeId,
        userProfile.id
      );
      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }

      // Reconstruct full text from chunks
      const fullText = await resumeChunkService.reconstructResumeText(resumeId);

      res.json({
        resume_id: resumeId,
        resume_title: resume.title,
        file_name: resume.file_name,
        full_text: fullText,
        text_length: fullText.length,
      });
    } catch (err) {
      console.error("Error reconstructing resume text:", err);
      res.status(500).json({ error: "Failed to reconstruct resume text" });
    }
  }
);

/**
 * Get user's chunk statistics
 * GET /api/user/resumes/chunks/stats
 */
router.get(
  "/chunks/stats",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ error: "No user ID" });
      }

      // Get user profile
      const userProfile = await userProfileService.getOrCreateUserProfile(
        userId,
        req.user?.email || "",
        req.user?.name,
        req.user?.picture
      );

      // Get chunk statistics
      const stats = await resumeChunkService.getUserChunkStats(userProfile.id);

      res.json({
        user_id: userProfile.id,
        total_chunks: stats.total_chunks,
        resumes_with_chunks: stats.resumes_with_chunks,
        avg_chunks_per_resume:
          Math.round(stats.avg_chunks_per_resume * 10) / 10,
      });
    } catch (err) {
      console.error("Error getting chunk stats:", err);
      res.status(500).json({ error: "Failed to get chunk statistics" });
    }
  }
);

export default router;
