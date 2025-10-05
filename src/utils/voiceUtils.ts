import { Content, GenerateContentConfig, GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ResponseInput } from "openai/resources/responses/responses";
import wav from "wav";
import z from "zod";
import { AI_MODEL, AI_VOICE_MODEL } from "../constants";

const clientOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// const clientOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const getAIResponse = async ({
  contents,
  config,
}: {
  contents: Content[] | string;
  config: GenerateContentConfig;
}) => {
  return ai.models.generateContent({
    model: AI_MODEL,
    contents,
    config,
  });
};

const RESPONSE_FORMAT = z.object({
  answer: z.string(),
});

export const getResponseFromOpenAI = async ({
  contents,
}: // config,
{
  contents: string | ResponseInput;
  // config: GenerateContentConfig;
}) => {
  return await clientOpenAI.responses.create({
    model: "gpt-4o",
    input: contents,
    text: {
      format: zodTextFormat(RESPONSE_FORMAT, "answer"),
    },
  });
};

export const getAIVoiceResponse = async ({
  contents,
  config,
}: {
  contents: string;
  config: GenerateContentConfig;
}) => {
  return ai.models.generateContent({
    model: AI_VOICE_MODEL,
    contents,
    config,
  });
};

export async function saveWaveFile(
  filename: string,
  pcmData: unknown,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
) {
  return new Promise((resolve, reject) => {
    const writer = new wav.FileWriter(filename, {
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    writer.on("finish", resolve);
    writer.on("error", reject);

    writer.write(pcmData);
    writer.end();
  });
}

export const pcmToWav = (
  pcmBuffer: Buffer,
  sampleRate = 24000,
  numChannels = 1
) => {
  const header = Buffer.alloc(44);

  const byteRate = sampleRate * numChannels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(numChannels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
};
