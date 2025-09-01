import { Router } from "express";
import { getQuestions, giveFeedback } from "../controllers/interviewController";

const router: Router = Router();

router.post("/feedback", giveFeedback);
router.get("/questions", getQuestions);

export default router;
