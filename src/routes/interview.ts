import { GoogleGenerativeAI } from "@google/generative-ai";
import { Router } from "express";
const router = Router();

// In-memory store for simplicity (you can use DB later)
interface Session {
  id: string;
  question: string;
  answers: { q: string; a: string }[];
}
const sessions: Record<string, Session> = {};

// Start new interview
router.post("/start", async (req, res) => {
  const { question } = req.body;
  const sessionId = Date.now().toString();

  sessions[sessionId] = { id: sessionId, question, answers: [] };
  res.json({ sessionId, question });
});

// Submit answer and get follow-up
router.post("/answer", async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    const session = sessions[sessionId];
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Save answer
    session.answers.push({ q: session.question, a: answer });

    // Store session in DB using Prisma
    // const interview = await prisma.interview.create({
    //   data: {
    //     sessionId: session.id,
    //   },
    // });

    if (process.env.AI_DISABLED === "true") {
      console.log("AI is disabled. Sending static follow-up.");
      res.json({
        followUp:
          "Thank you. Could you tell me a bit more about your professional background and what brings you here today?",
      });
      return;
    }

    // Ask AI for a follow-up question
    const prompt = `
      You are an interviewer. Based on the candidate's answer, ask ONE follow-up interview question only. 
      Do not give feedback yet.

      Previous Question: ${session.question}
      Candidate Answer: ${answer}
      Follow-up Question:`;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const followUp = result.response.text().trim();

    // Update session with new question
    session.question = followUp;

    res.json({ followUp });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Failed to get follow-up" });
  }
});

// End interview and give combined feedback
router.post("/end", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions[sessionId];
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (process.env.AI_DISABLED === "true") {
      console.log("AI is disabled. Sending static feedback.");

      res.json({
        feedback:
          'Hello Sushma, thank you for sharing your interview transcript. Let\'s break this down. It\'s important to remember that every interview is a learning opportunity, and with targeted practice, you can significantly enhance your performance.\n\nHere\'s my analysis:\n\n---\n\n### Interview Session Analysis\n\n**1. Overall Confidence Score (1-10): 4/10**\n\n*   **Rationale:** The answers are very brief and lack elaboration. While there\'s no overt sign of nervousness, the brevity and the question "Do you want me to explain more in detail" suggest a hesitancy to provide detail proactively. This can come across as a lack of confidence in one\'s ability to articulate, or an uncertainty about what the interviewer *wants* to hear. A confident candidate typically seizes the opportunity to elaborate and showcase their skills without being prompted.\n\n**2. Grammar Assessment:**\n\n*   **Generally Acceptable, but Lacking Polish:**\n    *   **"s/w developer"**: This is an informal abbreviation. In a professional interview, you should say "software developer."\n    *   **Punctuation/Listing**: In A1, "React JS Java and typescript" should ideally have a comma before the last item in a list of three or more: "React JS, Java, and TypeScript." (Also, "TypeScript" is capitalized).\n    *   **Phrasing in A2**: "NextJS and Node as backend" is slightly clunky. More formal phrasing would be "Next.js for the frontend and Node.js for the backend" or "using Next.js (frontend) and Node.js (backend)."\n    *   **"Geminin AI"**: Please double-check if this is the correct spelling. It\'s commonly known as "Gemini AI."\n*   **Overall:** Your responses are understandable, but these small details cumulatively detract from a polished, professional impression.\n\n**3. Content Quality:**\n\n*   **Q1: Tell me about yourself**\n    *   **Assessment:** Very low. This question is a golden opportunity to introduce your professional brand, highlight your most relevant skills, and express your career aspirations or what you\'re looking for. Your answer is merely a statement of your name, title, and a list of technologies. It doesn\'t tell the interviewer *why* these skills matter, what kind of developer you are, or what you bring to the table.\n    *   **Missed Opportunity:** You could have provided a concise narrative linking your experience, skills (like React JS, Java, TypeScript), and career goals relevant to the role.\n\n*   **Q2: Can you tell me about a recent project where you applied your skills in React JS, Java, or TypeScript?**\n    *   **Assessment:** Low. You\'ve given a project *title* and a list of technologies, but you haven\'t actually answered the core of the question: "where you *applied your skills*." This question demands a demonstration of problem-solving, your specific contributions, challenges faced, and outcomes achieved. You provided no context, no details about your role, no challenges, and no results.\n    *   **Missed Opportunity:** This is a classic behavioral question where the STAR method (Situation, Task, Action, Result) would be highly effective. The question "Do you want me to explain more in detail" indicates you knew more was needed, but you put the onus on the interviewer rather than taking the initiative.\n\n---\n\n### Three Improvement Suggestions\n\n1.  **Develop a Structured "Tell Me About Yourself" Narrative:**\n    *   **What to do:** Prepare a concise (60-90 second) summary that goes beyond just your name and title. A good framework is "Past, Present, Future":\n        *   **Past:** Briefly mention your background or how you got into software development.\n        *   **Present:** Talk about what you\'re currently doing, your core skills (e.g., "I specialize in building robust applications using React JS for dynamic frontends, Java for scalable backend services, and TypeScript for enhancing code quality and maintainability..."), and what you enjoy working on.\n        *   **Future:** Connect your skills and interests to the role you\'re interviewing for and what you hope to achieve.\n    *   **Example Start:** "Thank you. I\'m Sushma Manthena, and I\'m a passionate software developer with a strong foundation in modern web technologies. Over the past X years, I\'ve focused on building scalable and user-friendly applications. Currently, I specialize in leveraging React JS for interactive user interfaces, Java for robust backend logic, and TypeScript to ensure strong type safety and maintainability across projects. I\'m particularly enthusiastic about [mention something specific about the company/role]..."\n\n2.  **Master the STAR Method for Project/Experience Questions:**\n    *   **What to do:** For *any* question asking about a project, challenge, or achievement, structure your answer using the STAR method:\n        *   **S - Situation:** Briefly describe the context or background of the project.\n        *   **T - Task:** Explain your specific responsibilities or the goal you needed to achieve.\n        *   **A - Action:** Detail the *actions you took* to address the task, specifically mentioning how you applied your skills (React JS, Java, TypeScript, etc.). Be specific about your contributions.\n        *   **R - Result:** Describe the outcome or impact of your actions. Quantify if possible (e.g., "improved performance by 20%", "reduced bug reports by X"). What did you learn?\n    *   **Example for Q2:** "Certainly! A recent project I\'m actively developing is a mock interview application that leverages Gemini AI.\n        *   **(S)ituation:** The goal was to create an interactive platform for aspiring developers to practice interview skills with AI-driven feedback.\n        *   **(T)ask:** My primary role involves designing and implementing both the frontend user experience and the backend services.\n        *   **(A)ction:** On the frontend, I\'m using Next.js with React JS to build a highly responsive and intuitive interface for question display and user input. For the backend, I\'m developing RESTful APIs with Node.js to integrate with the Gemini AI service for real-time feedback processing and data storage. I\'m utilizing TypeScript across the stack to ensure code quality and maintainability, especially with complex data structures passed between the frontend and AI models.\n        *   **(R)esult:** The project is currently in its development phase, but early iterations have shown promising results in generating relevant questions and providing initial feedback. I anticipate this will be a valuable tool for interview preparation. I can elaborate on the specific technical challenges we\'ve overcome, such as [mention one specific challenge] if you\'d like."\n\n3.  **Proactive Communication and Refined Professional Language:**\n    *   **What to do:** Take the initiative in your answers. Instead of asking if the interviewer wants more detail, provide a comprehensive answer, and if you *still* have more to say, offer it as an option at the end.\n        *   **Avoid:** "Do you want me to explain more in detail?"\n        *   **Try instead:** "I can delve deeper into the technical architecture if that would be helpful," or "I\'d be happy to share more about the specific challenges we encountered if you\'re interested." This demonstrates control and preparedness.\n    *   **Language:** Consciously choose more formal and complete language. Use "software developer" instead of "s/w developer," ensure proper capitalization for technologies (React JS, Java, TypeScript, Next.js, Node.js), and speak in complete, well-structured sentences. Practice articulating your thoughts clearly and concisely, eliminating informalities.\n\n---\n\nSushma, you have valuable technical skills. The key to excelling in interviews is not just *having* the skills, but effectively *communicating* them and demonstrating *why* you are a strong candidate. By focusing on structuring your answers, being more proactive, and refining your language, you will project significantly more confidence and professionalism. Keep practicing!',
      });
      return;
    }

    const prompt = `
      You are a professional interview coach. Analyze the following interview session. 
      Provide:
      1. Overall confidence score (1-10)
      2. Grammar assessment
      3. Content quality
      4. Three improvement suggestions

      Interview Transcript:
        ${session.answers
          .map((x, i) => `Q${i + 1}: ${x.q}\nA${i + 1}: ${x.a}`)
          .join("\n\n")}
        `;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(prompt);
    const feedback = result.response.text();

    res.json({ feedback });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Failed to get feedback" });
  }
});

export default router;
