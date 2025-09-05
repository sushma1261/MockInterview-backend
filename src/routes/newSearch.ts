import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { Request, Response, Router } from "express";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { getDBPool } from "../db/pool";
import { authenticate } from "../middleware/auth";
import {
  getFeedbackPrompt,
  getInterviewPrompt,
  getTextEmbeddingsAPI,
  initializeVectorStore,
  llm,
} from "../utils";

const router = Router();

// ---------------- In-Memory Conversation Vector Stores ----------------
const userContexts = new Map<string, string[]>(); // resume context cache
const userConversationStores = new Map<string, MemoryVectorStore>(); // conversation memory

function getConversationStore(userId: string): MemoryVectorStore {
  if (!userConversationStores.has(userId)) {
    userConversationStores.set(
      userId,
      new MemoryVectorStore(getTextEmbeddingsAPI())
    );
  }
  return userConversationStores.get(userId)!;
}

async function storeConversationTurn(
  userId: string,
  input: string,
  output: string
) {
  const store = getConversationStore(userId);
  await store.addDocuments([
    { pageContent: `Human: ${input}`, metadata: { role: "human" } },
    { pageContent: `AI: ${output}`, metadata: { role: "ai" } },
  ]);
  console.log("Stored conversation turn for user:", userId);
}

async function fetchConversationContext(userId: string, query: string) {
  const store = getConversationStore(userId);
  const docs = await store.similaritySearch(query, 5);
  console.log("Fetched conversation context docs:", docs.length);
  return docs.map((d) => d.pageContent).join("\n");
}

// ---------------- Prompts & Chains ----------------

const interviewPrompt = getInterviewPrompt();

const interviewerChain = RunnableSequence.from([
  interviewPrompt,
  llm,
  new StringOutputParser(),
]);

const feedbackPrompt = getFeedbackPrompt();
const feedbackChain = feedbackPrompt.pipe(llm).pipe(new StringOutputParser());

// ---------------- Resume Context ----------------
async function fetchResumeContext(userId: string) {
  if (!userContexts.has(userId)) {
    console.log("Fetching resume context for user:", userId);
    try {
      const vectorStore = await initializeVectorStore(
        getDBPool(),
        getTextEmbeddingsAPI()
      );
      const docs = await vectorStore.similaritySearch(
        "help me prepare for behavioral interview based on the resume uploaded.",
        3,
        {
          filter: { user_id: userId },
        }
      );
      userContexts.set(
        userId,
        docs.map((d) => d.pageContent)
      );
      console.log("Saved resume context, chunks:", docs.length);
    } catch (e) {
      console.error("Error fetching resume context:", e);
      userContexts.set(userId, []);
    }
  }
  console.log("Using cached resume context for user:", userId);
  return userContexts.get(userId)!;
}

// ---------------- Routes ----------------

// Start Interview
router.post("/start", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "No user ID" });
    console.log("Starting interview for user:", userId);
    const retrievedDocs = await fetchResumeContext(userId);
    const context = retrievedDocs.join("\n\n");

    const conversation_history = await fetchConversationContext(
      userId,
      "start interview"
    );

    const firstQuestion = await interviewerChain.invoke({
      context,
      conversation_history,
      conversation:
        "Ask the FIRST interview question (behavioral or technical). Only the question.",
    });

    await storeConversationTurn(userId, "Begin interview", firstQuestion);

    res.json({ question: firstQuestion, retrievedDocs });
  } catch (err) {
    console.error("Error in /start:", err);
    res.status(500).json({ error: "Failed to start interview" });
  }
});

// Answer
router.post("/answer", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;
    const { answer } = req.body as { answer: string };
    if (!userId) return res.status(401).json({ error: "No user ID" });
    if (!answer) return res.status(400).json({ error: "Missing 'answer'" });

    const retrievedDocs = await fetchResumeContext(userId);
    const context = retrievedDocs.join("\n\n");

    const conversation_history = await fetchConversationContext(userId, answer);

    const followUp = await interviewerChain.invoke({
      context,
      conversation_history,
      conversation: `Candidate Answer: ${answer}\n\nAsk next question based on the answer and resume. 
      Ask 1 question at a time.
      Stop after asking 3 questions. 
      And ask user to ask for feedback after 3 questions
      Diversify your questions based on resume and answers given so far.
      `,
    });

    await storeConversationTurn(userId, answer, followUp);

    res.json({ followUp });
  } catch (err) {
    console.error("Error in /answer:", err);
    res.status(500).json({ error: "Failed to get follow-up" });
  }
});

// End
router.post("/end", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "No user ID" });

    const retrievedDocs = await fetchResumeContext(userId);
    const context = retrievedDocs.join("\n\n");

    const conversation_history = await fetchConversationContext(
      userId,
      "end interview"
    );

    const feedback = await feedbackChain.invoke({
      context,
      conversation_history,
    });

    await storeConversationTurn(
      userId,
      "End interview & request feedback",
      feedback
    );

    res.json({ feedback });
  } catch (err) {
    console.error("Error in /end:", err);
    res.status(500).json({ error: "Failed to generate feedback" });
  }
});

// Debug Info
router.get("/info", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "No user ID" });

  const store = getConversationStore(userId);
  const docs = await store.similaritySearch("all", 20);

  res.json({
    userId,
    context: userContexts.get(userId),
    turn: docs.map((d) => d.pageContent),
  });
});

export default router;
