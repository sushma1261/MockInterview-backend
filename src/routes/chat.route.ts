import { Request, Response, Router } from "express";
import redis from "../config/redis";
import { InterviewController } from "../controllers/InterviewControllers";
import pool from "../db/pool";
import { authenticate } from "../middleware/auth";
import { ChatRequest } from "../types/interviewTypes";

const router = Router();
const interviewController = new InterviewController(pool, redis);

/**
 * Non-streaming chat endpoint (original behavior)
 * Waits for complete response before sending to frontend
 */
router.post("/chat", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({ error: "No user ID" });
    }

    const chatRequest: ChatRequest = req.body;
    console.log(
      `Chat request from user: ${userId}, action: ${
        chatRequest.action || "continue"
      } JobDesc: ${chatRequest.job_description || "no job description"}`
    );

    const response = await interviewController.processChat(userId, chatRequest);
    res.json(response);
  } catch (err) {
    console.error("Error in /chat:", err);
    res.status(500).json({
      error: "Failed to process chat request",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * STREAMING chat endpoint using Server-Sent Events (SSE)
 * Streams chunks to frontend as they arrive from GenAI
 */
router.post(
  "/chat/stream",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({ error: "No user ID" });
      }

      const chatRequest: ChatRequest = req.body;
      console.log(
        `Streaming chat request from user: ${userId}, action: ${
          chatRequest.action || "continue"
        }`
      );

      // Set up Server-Sent Events (SSE) headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

      // Flush headers immediately
      res.flushHeaders();

      // Process chat with streaming callback
      const response = await interviewController.processChatStreaming(
        userId,
        chatRequest,
        // Callback function - called for each chunk
        async (chunk) => {
          // Send chunk to frontend via SSE
          res.write(
            `data: ${JSON.stringify({
              ...chunk,
              timestamp: Date.now(),
            })}\n\n`
          );
        }
      );

      // Send final complete response with metadata
      res.write(
        `data: ${JSON.stringify({
          type: "final",
          response: response,
          timestamp: Date.now(),
        })}\n\n`
      );

      res.end();
    } catch (err) {
      console.error("Error in streaming chat:", err);

      try {
        // Try to send error via SSE
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            error: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          })}\n\n`
        );
        res.end();
      } catch (writeErr) {
        // If we can't write (connection closed), just log
        console.error("Could not send error to client:", writeErr);
      }
    }
  }
);

/**
 * Clear session endpoint
 */
router.post(
  "/chat/clear",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({ error: "No user ID" });
      }

      await interviewController.clearSession(userId);

      res.json({
        success: true,
        message: "Chat session cleared",
      });
    } catch (err) {
      console.error("Error clearing chat:", err);
      res.status(500).json({ error: "Failed to clear session" });
    }
  }
);

/**
 * Get chat status endpoint
 */
router.get(
  "/chat/status",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({ error: "No user ID" });
      }

      const status = interviewController.getStatus(userId);
      res.json(status);
    } catch (err) {
      console.error("Error getting chat status:", err);
      res.status(500).json({ error: "Failed to get status" });
    }
  }
);

export default router;
