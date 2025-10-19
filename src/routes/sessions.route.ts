import { Request, Response, Router } from "express";
import redis from "../config/redis";
import { authenticate } from "../middleware/auth";
import { RedisSessionStore } from "../services/RedisSessionStore";
import { SessionCleanupScheduler } from "../services/SessionCleanupScheduler";

const router = Router();
const redisStore = RedisSessionStore.getInstance(redis);
const cleanupScheduler = new SessionCleanupScheduler(redis);

// Start cleanup scheduler on module load
cleanupScheduler.start();

/**
 * Get session statistics
 * GET /api/sessions/stats
 */
router.get("/stats", authenticate, async (req: Request, res: Response) => {
  try {
    const stats = await redisStore.getSessionStats();
    const activeUsers = await redisStore.getActiveSessions();

    res.json({
      ...stats,
      activeUserCount: activeUsers.length,
      cleanupSchedulerRunning: cleanupScheduler.isRunning(),
    });
  } catch (err) {
    console.error("Error getting session stats:", err);
    res.status(500).json({ error: "Failed to get session stats" });
  }
});

/**
 * Get current user's session info
 * GET /api/sessions/me
 */
router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: "No user ID" });
    }

    const [hasSession, metadata, turnCount] = await Promise.all([
      redisStore.hasChatSession(userId),
      redisStore.getSessionMetadata(userId),
      redisStore.getConversationTurnCount(userId),
    ]);

    res.json({
      userId,
      hasActiveSession: hasSession,
      turnCount,
      metadata,
    });
  } catch (err) {
    console.error("Error getting user session:", err);
    res.status(500).json({ error: "Failed to get session info" });
  }
});

/**
 * Force cleanup stale sessions (admin only)
 * POST /api/sessions/cleanup
 */
router.post("/cleanup", authenticate, async (req: Request, res: Response) => {
  try {
    // TODO: Add admin check
    const cleaned = await cleanupScheduler.forceCleanup();

    res.json({
      message: "Cleanup completed",
      sessionsRemoved: cleaned,
    });
  } catch (err) {
    console.error("Error forcing cleanup:", err);
    res.status(500).json({ error: "Failed to force cleanup" });
  }
});

/**
 * Clear current user's session
 * DELETE /api/sessions/me
 */
router.delete("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: "No user ID" });
    }

    await redisStore.clearUserSession(userId);

    res.json({
      message: "Session cleared successfully",
      userId,
    });
  } catch (err) {
    console.error("Error clearing user session:", err);
    res.status(500).json({ error: "Failed to clear session" });
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, stopping cleanup scheduler...");
  cleanupScheduler.stop();
});

process.on("SIGINT", () => {
  console.log("SIGINT received, stopping cleanup scheduler...");
  cleanupScheduler.stop();
});

export default router;
