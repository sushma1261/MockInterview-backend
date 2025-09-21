import { GoogleGenAI } from "@google/genai";
import { Request, Response, Router } from "express";
import {
  AI_VOICE_MODEL,
  VOICE_AI_RESPONSE_CONFIG,
  VOICE_SYSTEM_PROMPT,
} from "../constants";
import { getAIResponse, pcmToWav } from "../utils/voiceUtils";
const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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

  try {
    let responseFromAI;
    if (question) {
      responseFromAI = await getResponse({ question });
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

export default router;
