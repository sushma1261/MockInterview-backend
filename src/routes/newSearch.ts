import { SchemaType } from "@google/generative-ai";
import { Request, Response, Router } from "express";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { getDBPool } from "../db/pool";
import { authenticate } from "../middleware/auth";
import { handlers, tools } from "../tools";
import {
  genAI,
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
    { pageContent: `Human: ${input}`, metadata: { role: "user" } },
    { pageContent: `AI: ${output}`, metadata: { role: "ai" } },
  ]);
  console.log("Stored conversation turn for user:", userId);
}

async function fetchConversationContext(userId: string, query: string) {
  const store = getConversationStore(userId);
  const docs = await store.similaritySearch("all", 5);
  console.log("Fetched conversation context docs:", docs.length);
  return docs.map((d) => d.pageContent).join("\n");
}

const interviewPrompt = getInterviewPrompt();
const feedbackPrompt = getFeedbackPrompt();

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

const generateFeedback = async (userId: string) => {
  const retrievedDocs = await fetchResumeContext(userId);
  const context = retrievedDocs.join("\n\n");

  const conversation_history = await fetchConversationContext(
    userId,
    "end interview"
  );

  const feedback = await llm({
    prompt: await feedbackPrompt.format({
      context,
      conversation_history,
    }),
    schema: {
      type: SchemaType.OBJECT,
      properties: {
        confidence_score: { type: SchemaType.NUMBER },
        grammar_assessment: { type: SchemaType.STRING },
        content_quality: { type: SchemaType.STRING },
        improvement_suggestions: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
      required: [
        "confidence_score",
        "grammar_assessment",
        "content_quality",
        "improvement_suggestions",
      ],
    },
  });

  await storeConversationTurn(
    userId,
    "End interview & request feedback",
    JSON.stringify(feedback)
  );

  return feedback;
};

async function llmWithTools({
  prompt,
  schema,
}: {
  prompt: string;
  schema?: any;
}) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: schema
      ? {
          responseSchema: schema,
        }
      : {},
  });

  const response = result.response;
  console.log("LLM response:", JSON.stringify(response));
  const candidates = response?.candidates ?? [];
  console.log("LLM candidates:", candidates.length);

  const fnCall = candidates[0]?.content?.parts?.[0]?.functionCall;
  if (fnCall) {
    console.log("fnCall exists:", fnCall);
    const fnName = fnCall.name as keyof typeof handlers;
    const fnArgs = fnCall.args;

    if (handlers[fnName]) {
      console.log("Invoking tool:", fnName, "with args:", fnArgs);
      return await (handlers[fnName] as any)(fnArgs as any);
    }
  } else {
    console.log("No fnCall in response.");
  }
  console.log(
    "Returning raw text response.",
    candidates[0]?.content?.parts?.[0]?.text
  );
  return candidates[0]?.content?.parts?.[0]?.text ?? "";
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

    const firstQuestion = await llm({
      prompt: await interviewPrompt.format({
        context,
        conversation_history,
        conversation:
          "Ask the FIRST interview question (behavioral or technical). Only the question.",
      }),
      schema: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.STRING },
        },
        required: ["question"],
      },
    });

    await storeConversationTurn(
      userId,
      "Begin interview",
      JSON.stringify(firstQuestion)
    );

    res.json({ question: firstQuestion });
  } catch (err) {
    console.error("Error in /start:", err);
    res.status(500).json({ error: "Failed to start interview" });
  }
});

// Answer
router.post("/answer", authenticate, async (req: Request, res: Response) => {
  try {
    const { answer } = req.body;
    const userId = req.user?.uid;
    console.log("Received answer from user:", userId, answer);
    if (!userId) return res.status(401).json({ error: "No user ID" });

    // Get contexts
    const retrievedDocs = await fetchResumeContext(userId);
    const context = retrievedDocs.join("\n\n");
    const conversation_history = await fetchConversationContext(userId, answer);

    console.log("Processing answer for user:", userId);
    console.log("Calling llmWithTools: history", conversation_history);
    const result = await llmWithTools({
      prompt: await interviewPrompt.format({
        context,
        conversation_history,
        conversation: `Candidate Answer: ${answer}
        Ask next question OR generate feedback depending on context.
        `,
      }),
      // schema: { type: SchemaType.OBJECT, properties: {}, required: [] }
    });

    console.log("llmWithTools result:", result);

    await storeConversationTurn(userId, answer, JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error("Error in /answer:", err);
    res.status(500).json({ error: "Failed to process answer" });
  }
});

// End
router.post("/end", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "No user ID" });
    const feedback = await generateFeedback(userId);
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
