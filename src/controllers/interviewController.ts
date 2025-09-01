import axios from "axios";
import { Request, Response } from "express";

const model = "models/gemini-2.5-flash"; // or "models/gemini-1.5-pro-latest"
const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`;
const disableAI = true;

export const giveFeedback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { question, answer } = req.body;

    if (disableAI) {
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
      "Can you tell me about yourself?",
      "What are your strengths and weaknesses?",
      "Why do you want to work here?",
      "Describe a challenging situation you faced and how you handled it.",
      "Where do you see yourself in five years?",
      "Why should we hire you?",
    ];
    res.json({ questions });
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.status(500).json({ error: "Something went wrong fetching questions" });
  }
};
