import { Request, Response, Router } from "express";
import { InterviewController } from "../controllers/InterviewControllers";
import { authenticate } from "../middleware/auth";
import { ChatRequest } from "../types/interviewTypes";

const router = Router();
const interviewController = new InterviewController();

/**
 * Main chat endpoint
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
      }`
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
