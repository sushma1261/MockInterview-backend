import { Request, Response, Router } from "express";
import { authenticate } from "../middleware/auth";
const router = Router();

// Extend Express Request interface to include 'user'
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid?: string;
        // add other user properties if needed
      };
    }
  }
}

router.get("/", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "No user ID" });

  return res.json({ status: "ok", userId });
});

export default router;
