import { Request, Response, Router } from "express";
import { authenticate } from "../middleware/auth";
const router = Router();

router.get("/", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "No user ID" });

  return res.json({ status: "ok", userId });
});

export default router;
