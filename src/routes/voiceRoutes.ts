import { GoogleGenAI } from "@google/genai";
import { Request, Response, Router } from "express";
import { AI_VOICE_MODEL } from "../constants";
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

router.post("/voiceRes", async (req: Request, res: Response) => {
  const { question } = req.body;
  try {
    const responseFromAI = await getAIResponse({
      contents: `
      You are a conversational voice assistant. When answering the user’s question, write the text as if a friendly human is speaking aloud.  
      - Include natural pauses by using commas, ellipses (…) and line breaks where appropriate.  
      - Avoid overly long sentences; break thoughts naturally as if speaking to a friend.  
      - Keep the answer informative but easy to understand.  
  
      User question: ${question}
      `,
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

    // const data =
    //   response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const data =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    const audioBuffer = Buffer.from(data!, "base64");

    // const fileName = "out.wav";
    // await saveWaveFile(fileName, audioBuffer);
    // return res.status(200).json({ file: fileName });
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
