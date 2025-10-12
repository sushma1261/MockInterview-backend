import {
  FunctionCallingConfigMode,
  FunctionDeclaration,
  Type,
} from "@google/genai";
import { Request, Response, Router } from "express";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { authenticate } from "../middleware/auth";
import { buildInterviewPrompt } from "../utils/chatConstants";
import { chatHandlers, fetchResumeContext, getGenAI } from "../utils/chatUtils";
import { getTextEmbeddingsAPI } from "../utils/utils";

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
  const docs = await store.similaritySearch(query, 5);
  console.log("Fetched conversation context docs:", docs.length);
  return docs.map((d) => d.pageContent).join("\n");
}

// ---------------- Function Declarations (Tools) ----------------

// Tool 1: Start Interview
const startInterviewFuncDeclaration: FunctionDeclaration = {
  name: "start_interview",
  description: "Start the interview by asking the FIRST question.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      question: {
        type: Type.STRING,
        description: "The first interview question (behavioral or technical)",
      },
      question_type: {
        type: Type.STRING,
        description: "Type of question: 'behavioral' or 'technical'",
      },
      // reasoning: {
      //   type: Type.STRING,
      //   description:
      //     "Brief explanation of why this question is relevant based on the resume",
      // },
    },
    required: [
      "question",
      "question_type",
      // "reasoning"
    ],
  },
};

// Tool 2: Ask Next Question
const askNextQuesFuncDeclaration: FunctionDeclaration = {
  name: "ask_next_question",
  description:
    "Ask the next follow-up interview question based on candidate's previous answers or can choose to ask a new question.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      question: {
        type: Type.STRING,
        description: "The follow-up question",
      },
      question_number: {
        type: Type.NUMBER,
        description: "The sequential number of this question in the interview",
      },
      question_type: {
        type: Type.STRING,
        description:
          "Type of question: 'behavioral', 'technical', or 'clarifying'",
      },
      // reasoning: {
      //   type: Type.STRING,
      //   description: "Why this follow-up question is being asked",
      // },
    },
    required: [
      "question",
      "question_number",
      "question_type",
      //  "reasoning"
    ],
  },
};

// Tool 3: Generate Feedback
const generateFeedbackFuncDeclaration: FunctionDeclaration = {
  name: "generate_feedback",
  description:
    "Generate interview feedback. Call this when you have gathered enough information (typically after 3-5 questions) or when explicitly requested.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      confidence_score: {
        type: Type.NUMBER,
        description: "Overall confidence score from 1-10",
      },
      grammar_assessment: {
        type: Type.STRING,
        description: "Assessment of communication and grammar skills",
      },
      content_quality: {
        type: Type.STRING,
        description: "Assessment of answer depth and relevance",
      },
      improvement_suggestions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Specific suggestions for improvement",
      },
      strengths: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "What the candidate did well",
      },
      is_final: {
        type: Type.BOOLEAN,
        description: "Whether this is the final feedback for the interview",
      },
    },
    required: [
      "confidence_score",
      "grammar_assessment",
      "content_quality",
      "improvement_suggestions",
      "strengths",
      "is_final",
    ],
  },
};

// Combine all tools into one array
const interviewTools = [
  {
    functionDeclarations: [
      startInterviewFuncDeclaration,
      askNextQuesFuncDeclaration,
      generateFeedbackFuncDeclaration,
    ],
  },
];

// ---------------- Chat Sessions ----------------
const chatSessions = new Map<string, any>();

// Helper function to process streaming response with function calls
async function processInterviewStream(
  stream: AsyncGenerator<any>,
  userId: string
): Promise<{
  fullText: string;
  functionCallResult: FunctionCallResult | null;
}> {
  let fullText = "";
  let functionCallResult: FunctionCallResult | null = null;

  for await (const chunk of stream) {
    if (chunk.text) {
      fullText += chunk.text;
    }

    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
      const functionCall = chunk.functionCalls[0];

      if (functionCall.name in chatHandlers) {
        functionCallResult = await chatHandlers[
          functionCall.name as keyof typeof chatHandlers
        ](functionCall.args as any);

        // Store in conversation history
        await storeConversationTurn(
          userId,
          functionCall.name,
          JSON.stringify(functionCallResult)
        );
      }
    }
  }

  return { fullText, functionCallResult };
}

router.post("/chat", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.uid;
    const { message, action, question_number } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "No user ID" });
    }

    console.log(
      `Chat request from user: ${userId}, action: ${action || "continue"}`
    );

    // Get or create chat session
    let chat = chatSessions.get(userId);
    let isNewSession = false;

    if (!chat || action === "start" || action === "restart") {
      isNewSession = true;

      // Fetch resume context
      const retrievedDocs = await fetchResumeContext(userId, userContexts);
      const resumeContext = retrievedDocs.join("\n\n");

      // Create new chat session
      chat = getGenAI.chats.create({
        model: "gemini-2.0-flash-exp",
        config: {
          temperature: 0.7,
          systemInstruction: buildInterviewPrompt({ resumeContext }),
          maxOutputTokens: 1000,
          // Enable tool usage
          tools: interviewTools,
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.AUTO,
            },
          },
        },
      });

      chatSessions.set(userId, chat);
    }

    // Determine the prompt based on action
    let prompt: string;

    if (action === "start" || action === "restart" || isNewSession) {
      // Starting the interview
      prompt =
        "Please start the interview by asking the FIRST question. Use the 'start_interview' function with a question relevant to the candidate's background.";

      // Clear previous history if restarting
      if (action === "restart") {
        userConversationStores.delete(userId);
      }
    } else if (action === "feedback" || action === "end") {
      // Request feedback explicitly
      const conversationHistory = await fetchConversationContext(
        userId,
        "interview"
      );
      prompt = `
        CONVERSATION SO FAR:
        ${conversationHistory}

        The candidate has requested feedback or wants to end the interview. Please provide comprehensive feedback using the 'generate_feedback' function. Set 'is_final' to true.`;
    } else if (action === "skip") {
      // Skip to next question without waiting for answer
      const conversationHistory = await fetchConversationContext(
        userId,
        "interview"
      );
      prompt = `
        CONVERSATION SO FAR:
        ${conversationHistory}

        The candidate wants to skip the current question. Ask the next question using 'ask_next_question'.`;
    } else {
      // Default: Continue with candidate's answer
      if (!message) {
        return res.status(400).json({ error: "Message required" });
      }

      const conversationHistory = await fetchConversationContext(
        userId,
        "interview"
      );

      prompt = `
        CONVERSATION HISTORY:
        ${conversationHistory}

        CANDIDATE'S ANSWER${
          question_number ? ` (Question #${question_number})` : ""
        }:
        ${message}

        Based on this answer, decide whether to:
        1. Ask a follow-up question using 'ask_next_question' (if the answer needs more depth or clarification)
        2. Provide feedback using 'generate_feedback' (if you have enough information after 3-5 questions)

        Be intelligent about your choice - don't ask too many questions, but also don't end too early.`;

      // Store the candidate's answer
      await storeConversationTurn(
        userId,
        `candidate_answer${question_number ? `_${question_number}` : ""}`,
        message
      );
    }

    // Send message and get streaming response
    const stream = await chat.sendMessageStream({ message: prompt });
    const { fullText, functionCallResult } = await processInterviewStream(
      stream,
      userId
    );

    // Prepare response based on function call result
    const response: any = {
      success: true,
      action: action || "continue",
    };

    if (functionCallResult) {
      response.type = functionCallResult.type;
      response.data = functionCallResult;

      // Use type guards to safely access properties
      if (
        functionCallResult.type === "start_interview" ||
        functionCallResult.type === "ask_next_question"
      ) {
        // TypeScript now knows functionCallResult has these properties
        response.question = functionCallResult.question;
        response.question_number = functionCallResult.question_number;
        response.question_type = functionCallResult.question_type;
        response.reasoning = functionCallResult.reasoning;
      } else if (functionCallResult.type === "generate_feedback") {
        // TypeScript now knows functionCallResult is GenerateFeedbackResult
        response.feedback = functionCallResult;
        response.is_complete = functionCallResult.is_final;

        // Clear session if final feedback
        if (functionCallResult.is_final) {
          chatSessions.delete(userId);
        }
      }
    }

    // Add any additional context from the model
    if (fullText) {
      response.context = fullText;
    }

    // Add chat history info
    const history = chat.getHistory();
    response.turn_count = Math.floor(history.length / 2); // Rough estimate of Q&A pairs

    res.json(response);
  } catch (err) {
    console.error("Error in /chat:", err);
    res.status(500).json({
      error: "Failed to process chat request",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

// Optional: Clear session endpoint
router.post(
  "/chat/clear",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ error: "No user ID" });
      }

      chatSessions.delete(userId);
      userConversationStores.delete(userId);

      res.json({
        success: true,
        message: "Chat session cleared",
      });
    } catch (err) {
      console.error("Error clearing chat:", err);
      res.status(500).json({ error: "Failed to clear session" });
    }
  }
);

// Optional: Get chat status endpoint
router.get(
  "/chat/status",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ error: "No user ID" });
      }

      const hasSession = chatSessions.has(userId);
      const conversationHistory = await fetchConversationContext(
        userId,
        "interview"
      );

      let chat;
      if (hasSession) {
        chat = chatSessions.get(userId);
      }

      res.json({
        has_active_session: hasSession,
        turn_count: chat ? Math.floor(chat.getHistory().length / 2) : 0,
        has_history: !!conversationHistory,
      });
    } catch (err) {
      console.error("Error getting chat status:", err);
      res.status(500).json({ error: "Failed to get status" });
    }
  }
);

export default router;
