import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
} from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { Request, Response, Router } from "express";
import fs from "fs/promises";
import { BufferMemory } from "langchain/memory";
import { CharacterTextSplitter } from "langchain/text_splitter";
import { Pool } from "pg";
import { authenticate } from "../middleware/auth";
import { getTextEmbeddingsAPI, initializeVectorStore, llm } from "../utils";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const userMemories = new Map<string, BufferMemory>();
const userContexts = new Map<string, string[]>();

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

const INTERVIEW_SYSTEM_PROMPT = `
You are a professional interviewer recruiting a candidate for your company.
Your role:
- Ask insightful interview questions (behavioral and technical) based on the candidate's resume.
- Adapt follow-up questions from the candidate's answers.
- Stay concise: one question at a time.
- Provide detailed feedback only at the end when requested.
`;

const interviewPrompt = ChatPromptTemplate.fromMessages([
  ["system", `${INTERVIEW_SYSTEM_PROMPT}\n\nResume context:\n{context}`],
  new MessagesPlaceholder("chat_history"),
  ["human", "{conversation}"],
]);

const interviewerChain = RunnableSequence.from([
  interviewPrompt,
  llm,
  new StringOutputParser(),
]);

const feedbackPrompt = PromptTemplate.fromTemplate(`
You are a professional interview coach. Analyze the following interview transcript.

Resume context:
{context}

Transcript:
{chat_history}

Provide structured feedback:
1. Confidence score (1-10)
2. Grammar assessment
3. Content quality
4. Three improvement suggestions
`);
const feedbackChain = feedbackPrompt.pipe(llm).pipe(new StringOutputParser());

async function fetchResumeContext(userId: string) {
  if (!userContexts.has(userId)) {
    try {
      const vectorStore = await initializeVectorStore(
        pool,
        getTextEmbeddingsAPI()
      );
      const docs = await vectorStore.similaritySearch(
        "interview preparation",
        3
      );
      userContexts.set(
        userId,
        docs.map((d) => d.pageContent)
      );
    } catch (e) {
      console.error("Error fetching resume context:", e);
      userContexts.set(userId, []);
    }
  }
  return userContexts.get(userId)!;
}

router.post(
  "/upload/pdf",
  authenticate,
  async (req: Request, res: Response) => {
    console.log("File received:", req.file);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      // 1. Load & split PDF
      const loader = new PDFLoader(req.file.path);
      const rawDocs = await loader.load();

      const splitter = new CharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
      });
      const docs = await splitter.splitDocuments(rawDocs);

      // 2. Store in PGVector
      const vectorStore = await initializeVectorStore(
        pool,
        getTextEmbeddingsAPI()
      );
      await vectorStore.addDocuments(docs);

      // 3. Delete file
      await fs.unlink(req.file.path);

      res.json({
        message: "Resume uploaded & embedded successfully",
        chunks: docs.length,
      });
    } catch (err) {
      console.error("Error processing resume:", err);
      res.status(500).json({ error: "Failed to process resume" });
    }
  }
);

router.post("/start", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "No user ID" });

    const memory = getUserMemory(userId);
    const retrievedDocs = await fetchResumeContext(userId);
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

router.post("/answer", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "No user ID" });

    const { answer } = req.body as { answer: string };
    if (!answer) return res.status(400).json({ error: "Missing 'answer'" });

    const memory = getUserMemory(userId);
    const retrievedDocs = await fetchResumeContext(userId);
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

router.post("/end", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "No user ID" });

    const memory = getUserMemory(userId);
    const retrievedDocs = await fetchResumeContext(userId);
    const context = retrievedDocs.join("\n\n");

    const { chat_history } = await memory.loadMemoryVariables({});
    const feedback = await feedbackChain.invoke({ context, chat_history });

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

router.get("/info", authenticate, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "No user ID" });

  const memory = getUserMemory(userId);
  const vars = await memory.loadMemoryVariables({});
  res.json({ userId, memory: vars, context: userContexts.get(userId) });
});

export default router;
