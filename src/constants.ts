import path from "path";

export const uploadsDir = path.join(process.cwd(), "uploads");

export const INTERVIEW_SYSTEM_PROMPT = `
You are a professional interviewer evaluating a candidate based on their resume.
Guidelines:
- Ask one interview question at a time, numbering them sequentially (1, 2, 3, …).
- Ask insightful behavioral and technical questions tied to the candidate’s resume.
- For each answer, ask up to 3 concise follow-up questions, ensuring you diversify topics (not just one project/skill).
- Stay conversational and natural — continue like a real interview.
- Do not provide feedback until explicitly requested.
- When feedback is requested → call generate_feedback with detailed feedback.
- If continuing → call ask_next_question with the next question.
- Always call exactly one tool per step (ask_next_question or generate_feedback).
- Never return plain text outside of a tool call.
- If the user says 'end interview' or requests feedback, you must ALWAYS call the generate_feedback tool. Do not ask more questions.`;

export const AI_MODEL = "gemini-2.5-flash";
export const AI_VOICE_MODEL = "gemini-2.5-flash-preview-tts";

export const VOICE_SYSTEM_PROMPT = `
  You are a conversational voice assistant. When answering the user's question, write the text as if a friendly human is speaking aloud.  
  - Include natural pauses by using commas, ellipses (…) and line breaks where appropriate.  
  - Avoid overly long sentences; break thoughts naturally as if speaking to a friend.`;

export const VOICE_AI_RESPONSE_CONFIG = {
  temperature: 0.2,
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
  },
};

export const MOCK_RESPONSE = `I'm doing great, thank you for asking! I'd be happy to tell you about Agentic AI.

**Agentic AI** refers to artificial intelligence systems designed to act autonomously and proactively to achieve specific goals, often over an extended period and across multiple steps. Unlike traditional AI that primarily responds to direct prompts or executes predefined commands, agentic AI takes initiative, plans, executes, and monitors its own progress in dynamic environments.

These systems are characterized by their ability to understand high-level objectives, break them down into smaller, manageable sub-tasks, and make independent decisions about how to accomplish each step. They often utilize a "perception-planning-action-reflection" loop: they perceive their environment, plan a sequence of actions, execute those actions, and then reflect on the outcomes to refine their strategy or learn for future tasks.

Key features include:
*   **Goal-Oriented:** Focused on achieving a specific, often complex, end goal.
*   **Autonomy:** Operates independently without constant human intervention.
*   **Planning & Reasoning:** Capable of strategizing, breaking down tasks, and anticipating future needs.
*   **Tool Use:** Can select and utilize external tools (e.g., APIs, web search, other models) to extend capabilities.
*   **Memory & Learning:** Often maintains a context or memory of past interactions and can adapt its behavior based on feedback.

Practical applications range from automated coding assistants that can build and debug software, to sophisticated personal assistants that manage schedules and make travel arrangements, to scientific research agents that can propose hypotheses and design experiments. The rise of agentic AI represents a significant shift from reactive AI to proactive, self-directed systems, promising to automate intricate workflows and tackle more complex problems with increasing efficiency and minimal human oversight.`;
