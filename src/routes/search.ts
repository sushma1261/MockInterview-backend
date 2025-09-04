import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import { Request, Response, Router } from "express";
import { Pool } from "pg";
import { authenticate } from "../middleware/auth";

const router = Router();
// interface Session {
//   id: string;
//   question: string;
//   answers: { q: string; a: string }[];
// }
const sessions: Record<string, any> = {};

// Postgres pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Render requires SSL
  },
});

// Embeddings model (Gemini)
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GEMINI_API_KEY!,
  model: "text-embedding-004",
});

const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
  model: "gemini-2.5-flash",
});

// Search resume chunks
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    // Initialize vector store
    console.log("Pool config::", pool.options);
    const vectorStore = await PGVectorStore.initialize(embeddings, {
      pool,
      tableName: "resume_chunks",
      columns: {
        idColumnName: "id",
        vectorColumnName: "embedding",
        contentColumnName: "text",
        metadataColumnName: undefined,
      },
    });
    const question =
      "Help me prepare for behavioral interview questions based on my resume.";
    // Perform similarity search
    const retrievedDocs = await vectorStore.similaritySearch(question, 3); // top 3 matches

    const context = retrievedDocs.map((doc) => doc.pageContent).join("\n\n");

    // Prompt Template
    const prompt = PromptTemplate.fromTemplate(`
      You are an AI assistant helping a candidate analyze their resume.
      The candidate asked: "{question}"
      Here are the most relevant parts of their resume:
      {context}
      Based on the resume, ask the candidate 2-3 insightful questions that can help them prepare for job interviews.
      If the resume does not provide relevant information, ask general questions about their skills and experience.
    `);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    // Run chain
    const answer = await chain.invoke({
      question,
      context,
    });

    res.json({
      question,
      answer,
      retrieved: retrievedDocs.map((d) => d.pageContent),
    });
  } catch (err) {
    console.error("Error during search:", err);
    res.status(500).json({ error: "Failed to search resume" });
  }
});

// 🟢 Start a new chat session
router.post("/start", authenticate, async (req: Request, res: Response) => {
  try {
    const sessionId = Date.now().toString();

    let firstQuestion: string;
    let retrievedDocs: string[] = [];

    try {
      // Use vector store to pull resume context
      const vectorStore = await PGVectorStore.initialize(embeddings, {
        pool,
        tableName: "resume_chunks",
        columns: {
          idColumnName: "id",
          vectorColumnName: "embedding",
          contentColumnName: "text",
          metadataColumnName: undefined,
        },
      });

      const query =
        "Help me prepare for behavioral interview questions based on my resume.";
      const docs = await vectorStore.similaritySearch(query, 3);
      retrievedDocs = docs.map((d) => d.pageContent);
      console.log("Retrieved resume docs:");
      const context = retrievedDocs.join("\n\n");

      const prompt = `
        You are an interviewer preparing a candidate based on their resume.
        Resume snippets:\n${context}\n
        Ask the candidate their FIRST interview question (behavioral or technical).
        Only return the question.`;

      const result = await llm.invoke(prompt);
      firstQuestion = result.content.toString().trim();
      console.log("First question:", firstQuestion);
    } catch (e) {
      // Generic fallback question
      console.log("No resume context, using generic question.");
      firstQuestion = "Tell me about yourself.";
    }

    sessions[sessionId] = {
      id: sessionId,
      history: [],
      question: firstQuestion,
      retrievedDocs,
    };

    res.json({ sessionId, question: firstQuestion, retrievedDocs });
  } catch (err) {
    console.error("Error in /start:", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

// 🟢 Answer and get follow-up
router.post("/answer", authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId, answer } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Save Q/A into history
    session.history.push({ q: session.question, a: answer });

    // Build prompt with context
    const context = session.retrievedDocs?.join("\n\n") || "";
    console.log("Using context:\n", context);
    const prompt = `
      You are an interviewer. Use the candidate's resume context if available:\n${context}\n
      Previous Question: ${session.question}
      Candidate Answer: ${answer}
      Ask ONE insightful follow-up question. Do not provide feedback yet.`;

    const result = await llm.invoke(prompt);
    const followUp = result.content.toString().trim();

    // Update session
    session.question = followUp;
    console.log("Follow-up question:", followUp);

    res.json({ followUp });
  } catch (err) {
    console.error("Error in /answer:", err);
    res.status(500).json({ error: "Failed to get follow-up" });
  }
});

// 🟢 End interview → feedback
router.post("/end", authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const transcript = session.history
      .map((x: any, i: number) => `Q${i + 1}: ${x.q}\nA${i + 1}: ${x.a}`)
      .join("\n\n");

    const prompt = `
      You are a professional interview coach. Analyze the following interview transcript and provide:
      1. Confidence score (1-10)
      2. Grammar assessment
      3. Content quality
      4. 3 improvement suggestions
      ---
      Transcript:
      ${transcript}
    `;

    const result = await llm.invoke(prompt);
    const feedback = result.content.toString().trim();

    res.json({ feedback });
  } catch (err) {
    console.error("Error in /end:", err);
    res.status(500).json({ error: "Failed to end session" });
  }
});

// 🟢 Info endpoint (for UI sidebar/debugging)
router.get("/info/:sessionId", authenticate, (req: Request, res: Response) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  res.json({
    id: session.id,
    currentQuestion: session.question,
    history: session.history,
    retrievedDocs: session.retrievedDocs,
  });
});

export default router;
