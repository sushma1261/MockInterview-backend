import { Request, Response, Router } from "express";
import { authenticate } from "../middleware/auth";
const router = Router();

// Public — used by Docker healthcheck and load balancers, no auth required
router.get("/", (req: Request, res: Response) => {
  return res.status(200).json({ status: "ok" });
});

// Authenticated — returns user-specific health info
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "No user ID" });

  return res.json({ status: "ok", userId });
});

export default router;
