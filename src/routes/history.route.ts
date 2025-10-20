import { Request, Response, Router } from "express";
import pool from "../db/pool";
import { authenticate } from "../middleware/auth";
import { InterviewSessionService } from "../services/InterviewSessionService";

const router = Router();
const sessionService = InterviewSessionService.getInstance(pool);

/**
 * Get all interview sessions for the authenticated user
 * Optional filters: resume_id, status, limit
 */
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const userProfileId = req.userProfile?.id;

    if (!userProfileId) {
      return res.status(401).json({ error: "No user profile ID" });
    }

    const resumeId = req.query.resume_id
      ? parseInt(req.query.resume_id as string)
      : undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string)
      : undefined;

    const sessions = await sessionService.getUserSessions(userProfileId, {
      resumeId,
      status,
      limit,
    });

    res.json({
      success: true,
      count: sessions.length,
      sessions,
    });
  } catch (err) {
    console.error("Error fetching user sessions:", err);
    res.status(500).json({
      error: "Failed to fetch sessions",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Get detailed information for a specific session
 * Includes full chat history and feedback
 */
router.get("/:sessionId", authenticate, async (req: Request, res: Response) => {
  try {
    const userProfileId = req.userProfile?.id;
    const sessionId = parseInt(req.params.sessionId);

    if (!userProfileId) {
      return res.status(401).json({ error: "No user profile ID" });
    }

    if (isNaN(sessionId)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    // Get session details
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Verify ownership
    if (session.user_id !== userProfileId) {
      return res
        .status(403)
        .json({ error: "You don't have access to this session" });
    }

    // Get chat messages and feedback
    const messages = await sessionService.getSessionMessages(sessionId);
    const feedback = await sessionService.getSessionFeedback(sessionId);

    res.json({
      success: true,
      session,
      messages,
      feedback,
    });
  } catch (err) {
    console.error("Error fetching session details:", err);
    res.status(500).json({
      error: "Failed to fetch session details",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Get conversation history as formatted text
 */
router.get(
  "/:sessionId/conversation",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userProfileId = req.userProfile?.id;
      const sessionId = parseInt(req.params.sessionId);
      const limit = req.query.limit
        ? parseInt(req.query.limit as string)
        : undefined;

      if (!userProfileId) {
        return res.status(401).json({ error: "No user profile ID" });
      }

      if (isNaN(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID" });
      }

      // Verify ownership
      const session = await sessionService.getSession(sessionId);
      if (!session || session.user_id !== userProfileId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const conversation = await sessionService.getConversationHistory(
        sessionId,
        limit
      );

      res.json({
        success: true,
        sessionId,
        conversation,
      });
    } catch (err) {
      console.error("Error fetching conversation:", err);
      res.status(500).json({
        error: "Failed to fetch conversation",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

/**
 * Get user statistics
 * Shows overall performance and usage metrics
 */
router.get(
  "/stats/summary",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userProfileId = req.userProfile?.id;

      if (!userProfileId) {
        return res.status(401).json({ error: "No user profile ID" });
      }

      const stats = await sessionService.getUserStats(userProfileId);

      res.json({
        success: true,
        stats,
      });
    } catch (err) {
      console.error("Error fetching user stats:", err);
      res.status(500).json({
        error: "Failed to fetch statistics",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

/**
 * Get all job descriptions for the user
 * Useful for dropdown/selection UI
 */
router.get(
  "/job-descriptions/all",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userProfileId = req.userProfile?.id;

      if (!userProfileId) {
        return res.status(401).json({ error: "No user profile ID" });
      }

      const jobDescriptions = await sessionService.getUserJobDescriptions(
        userProfileId
      );

      res.json({
        success: true,
        count: jobDescriptions.length,
        jobDescriptions,
      });
    } catch (err) {
      console.error("Error fetching job descriptions:", err);
      res.status(500).json({
        error: "Failed to fetch job descriptions",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

/**
 * Manually create or save a job description
 * For future extensibility (Option C from requirements)
 */
router.post(
  "/job-descriptions",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userProfileId = req.userProfile?.id;

      if (!userProfileId) {
        return res.status(401).json({ error: "No user profile ID" });
      }

      const { description, title, company_name } = req.body;

      if (!description) {
        return res.status(400).json({ error: "Job description is required" });
      }

      const jobDescId = await sessionService.saveJobDescription(
        userProfileId,
        description,
        title,
        company_name
      );

      res.json({
        success: true,
        message: "Job description saved successfully",
        jobDescriptionId: jobDescId,
      });
    } catch (err) {
      console.error("Error saving job description:", err);
      res.status(500).json({
        error: "Failed to save job description",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

export default router;
