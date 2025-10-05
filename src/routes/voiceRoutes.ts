import { Request, Response, Router } from "express";
import fs from "fs";
import path from "path";
import {
  AI_MODEL,
  AI_VOICE_MODEL,
  MOCK_RESPONSE,
  VOICE_AI_RESPONSE_CONFIG,
  VOICE_SYSTEM_PROMPT,
} from "../constants";
import { isAIDisabled } from "../utils/utils";
import {
  ai,
  getAIResponse,
  getResponseFromOpenAI,
  pcmToWav,
} from "../utils/voiceUtils";

const router = Router();

const useOpenAIModel = false;

router.post("/", async (req: Request, res: Response) => {
  const { question } = req.body;
  const response = await getAIResponse({
    contents: question,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      },
    },
  });
  return res.status(200).json({ response: JSON.parse(response.text!) });
});

const getOpenAIResponse = async ({ question }: { question?: string }) => {
  return await getResponseFromOpenAI({
    contents: `
      ${VOICE_SYSTEM_PROMPT}
      User question: ${question}
      `,
  });
};

const getResponse = async ({
  base64data,
  mimeType,
  question,
}: {
  base64data?: Base64URLString;
  mimeType?: string;
  question?: string;
}) => {
  if (base64data && mimeType) {
    return await getAIResponse({
      contents: [
        {
          parts: [
            {
              text: `${VOICE_SYSTEM_PROMPT}  
              - First tell what user asked and then answer the question.
              User question in audio format (base64-encoded)`,
            },
            { inlineData: { data: base64data, mimeType: mimeType } },
          ],
        },
      ],
      config: VOICE_AI_RESPONSE_CONFIG,
    });
  }
  return await getAIResponse({
    contents: `
      ${VOICE_SYSTEM_PROMPT} 
      User question: ${question}
      `,
    config: VOICE_AI_RESPONSE_CONFIG,
  });
};

router.post("/getVoice", async (req: Request, res: Response) => {
  const { base64data, mimeType, question } = req.body;

  if (isAIDisabled()) {
    let answerText: string;
    let audioBase64: string;
    // Static response when AI is disabled
    answerText =
      "AI features are currently disabled. Please contact support for assistance.";

    // Read static audio file
    const audioFilePath = path.join(__dirname, "../../out.wav"); // Adjust path as needed
    const audioBuffer = fs.readFileSync(audioFilePath);
    audioBase64 = audioBuffer.toString("base64");

    return res.json({
      answer: answerText,
      audioBase64: audioBase64,
      mimeType: "audio/wav",
    });
  }

  try {
    let responseFromAI;
    if (question) {
      if (useOpenAIModel) {
        responseFromAI = await getOpenAIResponse({ question });
        return res.json({
          response: responseFromAI,
        });
      } else {
        responseFromAI = await getResponse({ question });
      }
    } else {
      responseFromAI = await getResponse({ base64data, mimeType });
    }

    const answerText = JSON.parse(responseFromAI.text!).answer;
    console.log("Answer text:", answerText);
    const response = await ai.models.generateContent({
      model: AI_VOICE_MODEL,
      contents: [
        {
          parts: [
            {
              text: `Say professionally and include natural pauses and sa in warm tones: ${answerText}`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    const data =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    const audioBuffer = Buffer.from(data!, "base64");
    if (!data) {
      return res
        .status(500)
        .json({ error: "No audio data returned from model" });
    }

    // ✅ Send base64 directly to UI
    const wavBuffer = pcmToWav(audioBuffer);
    console.log("Response from AI:", responseFromAI);
    return res.json({
      answer: answerText,
      audioBase64: wavBuffer.toString("base64"),
      mimeType: "audio/wav", // now browser-friendly
    });
  } catch (err) {
    console.error("voiceRes error:", err);
    return res.status(500).json({
      error: "Failed to generate voice",
      details: err instanceof Error ? err.message : err,
    });
  }
});

router.post("/stream", async (req: Request, res: Response) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  // Stream chunks to client
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const contents = question;

    let stream;
    if (isAIDisabled()) {
      console.log("AI is disabled, using mock response stream");
      const chunkSize = 200;
      stream = [];
      for (let i = 0; i < MOCK_RESPONSE.length; i += chunkSize) {
        stream.push({ text: MOCK_RESPONSE.slice(i, i + chunkSize) });
      }
    } else {
      stream = await ai.models.generateContentStream({
        model: AI_MODEL,
        contents,
      });
    }

    for await (const chunk of stream) {
      const text = chunk.text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
      console.log("Stream chunk:", text);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    // Signal completion
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Streaming error:", err);
    res.write(`data: ${JSON.stringify({ error: "Streaming failed" })}\n\n`);
    res.end();
  }
});

export default router;
