import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { getDBPool } from "../db/pool";
import {
  answerNextQuesFuncDeclaration,
  generateFeedbackFuncDeclaration,
  handlers,
} from "../tools";
import { getTextEmbeddingsAPI, initializeVectorStore } from "../utils/utils";
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
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
  vertexai: true,
});

async function llmWithTools({ prompt }: { prompt: string }) {
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [
        {
          functionDeclarations: [
            answerNextQuesFuncDeclaration,
            generateFeedbackFuncDeclaration,
          ],
        },
      ],
    },
  });
  // if (response.functionCalls && response.functionCalls.length > 0) {
  //   const functionCall = response.functionCalls[0]; // Assuming one function call
  //   console.log(`Function to call: ${functionCall.name}`);
  //   console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);
  //   handlers[functionCall.name as keyof typeof handlers](
  //     functionCall.args as any
  //   );
  // } else {
  //   console.log("No function call found in the response.");
  //   console.log(response.text);
  // }
  for await (const chunk of response) {
    // Check for function calls in each chunk
    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
      console.log("\n[Function calls detected in stream]");

      for (const functionCall of chunk.functionCalls) {
        console.log(`\nCalling function: ${functionCall.name}`);

        // Execute the handler
        if (functionCall.name && functionCall.name in handlers) {
          await handlers[functionCall.name as keyof typeof handlers](
            functionCall.args as any
          );
        }
      }
    }

    // Also check for text content
    if (chunk.text) {
      process.stdout.write(chunk.text);
    }
  }
  return response;
}

router.post("/chat", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "No user ID" });
});

// export default router;
