import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { Request, Response, Router } from "express";
import { BufferMemory } from "langchain/memory";
import { getDBPool } from "../db/pool";
import { authenticate } from "../middleware/auth";
import {
  getTextEmbeddingsAPI,
  initializeVectorStore,
  llm,
} from "../utils/utils";

const router = Router();
const pool = getDBPool();

/* AI Interviewer persona */
const INTERVIEW_SYSTEM_PROMPT = `
You are a professional interviewer and recruiting a candidate for your company.
Your role:
- Ask insightful interview questions (behavioral and technical) based on the candidate's resume.
- Adapt follow-up questions from the candidate's answers.
- Stay concise: one question at a time.
- Provide detailed feedback only at the end when requested.
`;

/** Per-user memory map userId - BufferMemory */
const userMemories = new Map<string, BufferMemory>();

// BufferMemory stores chat history in memory (not DB)
function getUserMemory(userId: string): BufferMemory {
  if (!userMemories.has(userId)) {
    userMemories.set(
      userId,
      new BufferMemory({
        memoryKey: "chat_history",
        returnMessages: true,
      })
    );
  }
  return userMemories.get(userId)!;
}

/** Prompt + LangChain */
const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `${INTERVIEW_SYSTEM_PROMPT}\n\nResume context (if available):\n{context}`,
  ],
  new MessagesPlaceholder("chat_history"),
  ["human", "{conversation}"],
]);

const interviewerChain = RunnableSequence.from([
  prompt,
  llm,
  new StringOutputParser(),
]);

/** 🔎 Utility: fetch resume context */
async function getResumeContext() {
  try {
    const vectorStore = await initializeVectorStore(
      pool,
      getTextEmbeddingsAPI()
    );
    const docs = await vectorStore.similaritySearch("interview preparation", 3);
    return docs.map((d) => d.pageContent);
  } catch (e) {
    console.error("Error fetching resume context:", e);
    return [];
  }
}

// Start interview → first question
router.post("/start", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "No user ID" });

    const memory = getUserMemory(userId);
    const retrievedDocs = await getResumeContext();
    const context = retrievedDocs.join("\n\n");
    const { chat_history } = await memory.loadMemoryVariables({});

    const firstQuestion = await interviewerChain.invoke({
      context,
      chat_history,
      conversation:
        "Ask the FIRST interview question (behavioral or technical). Only the question.",
    });

    await memory.saveContext(
      { input: "Begin interview" },
      { output: firstQuestion }
    );

    res.json({ question: firstQuestion, retrievedDocs });
  } catch (err) {
    console.error("Error in /start:", err);
    res.status(500).json({ error: "Failed to start interview" });
  }
});

// Candidate answers → follow-up
router.post("/answer", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "No user ID" });

    const { answer } = req.body as { answer: string };
    if (!answer) return res.status(400).json({ error: "Missing 'answer'" });

    const memory = getUserMemory(userId);
    const retrievedDocs = await getResumeContext();
    const context = retrievedDocs.join("\n\n");
    const { chat_history } = await memory.loadMemoryVariables({});

    const followUp = await interviewerChain.invoke({
      context,
      chat_history,
      conversation: `Candidate Answer: ${answer}\n\nAsk ONE insightful follow-up question.`,
    });

    await memory.saveContext({ input: answer }, { output: followUp });

    res.json({ followUp });
  } catch (err) {
    console.error("Error in /answer:", err);
    res.status(500).json({ error: "Failed to get follow-up" });
  }
});

// End interview → feedback
router.post("/end", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "No user ID" });

    const memory = getUserMemory(userId);
    const retrievedDocs = await getResumeContext();
    const context = retrievedDocs.join("\n\n");
    const { chat_history } = await memory.loadMemoryVariables({});

    const feedback = await interviewerChain.invoke({
      context,
      chat_history,
      conversation: `
Provide final feedback:
1) Confidence score (1-10)
2) Grammar assessment
3) Content quality
4) Three improvement suggestions
      `.trim(),
    });

    await memory.saveContext(
      { input: "End interview & request feedback" },
      { output: feedback }
    );

    res.json({ feedback });
  } catch (err) {
    console.error("Error in /end:", err);
    res.status(500).json({ error: "Failed to generate feedback" });
  }
});

// Debug: inspect per-user memory
router.get("/info", authenticate, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "No user ID" });

  const memory = getUserMemory(userId);
  const vars = await memory.loadMemoryVariables({});
  res.json({ userId, memory: vars });
});

export default router;
