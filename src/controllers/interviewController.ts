import axios from "axios";
import { Request, Response } from "express";

const model = "models/gemini-2.5-flash"; // or "models/gemini-1.5-pro-latest"
const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`;

export const giveFeedback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { question, answer } = req.body;

    if (process.env.AI_DISABLED === "true") {
      console.log("AI is disabled. Sending static feedback.");

      res.json({
        reply: {
          confidence: 7,
          grammar: "Good grammar with minor issues.",
          content_quality: "Answer is relevant but could be more detailed.",
          improvement_suggestions: [
            "Provide specific examples to illustrate your points.",
            "Expand on your strengths with more detail.",
            "Work on reducing filler words like 'um' and 'like'.",
          ],
        },
      });
      return;
    }

    if (!question || !answer) {
      res.status(400).json({ error: "Question and answer are required." });
      return;
    }

    const prompt = `
      You are an interview coach.
      Question: ${question}
      Candidate's Answer: ${answer}

      Evaluate the answer and provide feedback in JSON format with the following fields:
      - confidence: rate from 1-10
      - grammar: short feedback
      - content_quality: short feedback
      - improvement_suggestions: 2-3 bullet points
    `;

    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY as string,
        },
      }
    );

    let aiResponse: string =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I couldn’t generate a response.";
    aiResponse = aiResponse.replace(/```json|```/g, "").trim();

    let feedback;
    try {
      feedback = JSON.parse(aiResponse);
    } catch (e) {
      // Fallback: wrap raw text if not valid JSON
      feedback = {
        confidence: "Couldn't parse confidence",
        grammar: "Could not parse grammar feedback",
        content_quality: aiResponse,
        improvement_suggestions: ["Could not parse improvement suggestions"],
      };
    }
    res.json({ reply: feedback });
  } catch (error) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: "Something went wrong with Gemini AI" });
  }
};

export const getQuestions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const questions = [
      {
        id: 1,
        text: "Tell me about yourself",
        level: "Easy",
        type: "Behavioral",
      },
      {
        id: 2,
        text: "Why do you want this job?",
        level: "Easy",
        type: "Behavioral",
      },
      {
        id: 3,
        text: "What is your greatest strength?",
        level: "Easy",
        type: "Behavioral",
      },
      {
        id: 4,
        text: "Describe a challenging project.",
        level: "Medium",
        type: "Behavioral",
      },
    ];
    res.json({ questions });
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.status(500).json({ error: "Something went wrong fetching questions" });
  }
};
