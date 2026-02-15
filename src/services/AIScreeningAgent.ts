import { FunctionCallingConfigMode, Type } from "@google/genai";
import { AI_MODEL } from "../constants";
import {
  JobDescription,
  ResumeScreeningResult,
  ValidationError,
} from "../types/recruitment";
import { getGenAI } from "../utils/chatUtils";

/**
 * AI Screening Agent
 * Uses Google Gemini with function calling to analyze resumes against job descriptions
 */
export class AIScreeningAgent {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
  }

  /**
   * Screen a single resume against job description
   */
  async screenResume(
    resumeText: string,
    jobDescription: JobDescription
  ): Promise<ResumeScreeningResult> {
    try {
      // Validate inputs
      if (!resumeText || resumeText.trim().length === 0) {
        throw new ValidationError("Resume text cannot be empty");
      }

      // Build the screening prompt
      const prompt = this.buildScreeningPrompt(resumeText, jobDescription);

      // Create chat with function calling (similar to ChatSessionManager pattern)
      const screeningToolConfig = {
        tools: this.getScreeningTools(),
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY, // Force AI to call a function
          },
        },
      };

      const chat = getGenAI.chats.create({
        model: AI_MODEL,
        config: {
          temperature: 0.3,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
          ...screeningToolConfig,
        },
      });

      // Send prompt and get response (use sendMessage with message object)
      const result = await chat.sendMessage({ message: prompt });

      // Extract function call from response
      if (!result.functionCalls || result.functionCalls.length === 0) {
        throw new Error("AI did not return function call");
      }

      const functionCall = result.functionCalls[0];

      // Validate and return
      if (functionCall.name === "analyze_resume_match") {
        return this.validateScreeningResult(functionCall.args);
      }

      throw new Error(`Unexpected function call: ${functionCall.name}`);
    } catch (error: any) {
      console.error("AI Screening Error:", error);
      throw new Error(`Resume screening failed: ${error.message}`);
    }
  }

  /**
   * Build screening prompt with job description and resume
   */
  private buildScreeningPrompt(resumeText: string, jd: JobDescription): string {
    return `
You are an expert AI recruiter and ATS (Applicant Tracking System) with 15 years of experience.
Your task is to analyze how well a candidate's resume matches a job description.

IMPORTANT GUIDELINES:
1. Be objective and fair - no bias based on gender, race, age, or background
2. Focus on skills, experience, and qualifications
3. Consider transferable skills (e.g., Java developer can learn TypeScript)
4. Give credit for relevant projects even if not professional experience
5. Be realistic but not overly harsh

═══════════════════════════════════════════════════════════════
JOB DESCRIPTION
═══════════════════════════════════════════════════════════════

Position: ${jd.title}
Company: ${jd.company_name || "Not specified"}

Required Experience: ${jd.required_experience_years || "Not specified"} years
Required Skills: ${jd.required_skills?.join(", ") || "Not specified"}

Full Description:
${jd.description}

${
  jd.requirements
    ? `
Requirements:
${jd.requirements}
`
    : ""
}

═══════════════════════════════════════════════════════════════
CANDIDATE RESUME
═══════════════════════════════════════════════════════════════

${resumeText}

═══════════════════════════════════════════════════════════════
ANALYSIS INSTRUCTIONS
═══════════════════════════════════════════════════════════════

Analyze the resume carefully and calculate scores based on these criteria:

1. OVERALL MATCH SCORE (0-100):
   - Skills Match: 40% weight
   - Experience Match: 30% weight
   - Education Match: 20% weight
   - Cultural Fit Indicators: 10% weight

2. SKILLS MATCH (0-100):
   - Compare required skills with candidate's skills
   - Consider similar/related skills (e.g., React Native ~ React)
   - Look at years of experience with each skill
   - Check for depth vs breadth

3. EXPERIENCE MATCH (0-100):
   - Compare years of experience required vs actual
   - Consider relevance of past roles
   - Look at career progression
   - Check for leadership/mentorship if required

4. EDUCATION MATCH (0-100):
   - Compare degree requirements
   - Consider relevant certifications
   - Look at specialized training
   - Self-taught + portfolio can compensate

5. IDENTIFY:
   - Matched Skills: Skills from JD found in resume (be specific)
   - Missing Skills: Required skills NOT in resume
   - Strengths: 3-5 key strengths that make them a good fit
   - Concerns: 3-5 potential concerns or gaps

6. RECOMMENDATION:
   - strong_match (80-100): Excellent fit, definitely interview
   - good_match (60-79): Good fit, likely worth interviewing
   - moderate_match (40-59): Some fit, consider if positions available
   - weak_match (20-39): Poor fit, likely not suitable
   - no_match (0-19): No fit, reject

7. DETAILED ANALYSIS:
   Write 2-3 paragraphs explaining your scoring and recommendation.

Now call the analyze_resume_match function with your complete analysis.
`;
  }

  /**
   * Function declarations for Gemini (using @google/genai Type pattern like InterviewToolsConfig)
   */
  private getScreeningTools() {
    return [
      {
        functionDeclarations: [
          {
            name: "analyze_resume_match",
            description:
              "Analyze and score how well a candidate's resume matches the job requirements",
            parameters: {
              type: Type.OBJECT,
              properties: {
                overall_match_score: {
                  type: Type.NUMBER,
                  description:
                    "Overall match score from 0 to 100 (weighted average)",
                },
                skills_match: {
                  type: Type.NUMBER,
                  description: "Skills match score from 0 to 100",
                },
                experience_match: {
                  type: Type.NUMBER,
                  description: "Experience match score from 0 to 100",
                },
                education_match: {
                  type: Type.NUMBER,
                  description: "Education match score from 0 to 100",
                },
                matched_skills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "List of required skills that candidate has (from job description)",
                },
                missing_skills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "List of required skills that candidate lacks (from job description)",
                },
                strengths: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "3-5 key strengths of the candidate relevant to this role",
                },
                concerns: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "3-5 potential concerns or gaps in candidate's profile",
                },
                recommendation: {
                  type: Type.STRING,
                  enum: [
                    "strong_match",
                    "good_match",
                    "moderate_match",
                    "weak_match",
                    "no_match",
                  ],
                  description: "Overall hiring recommendation",
                },
                detailed_analysis: {
                  type: Type.STRING,
                  description:
                    "2-3 paragraph detailed explanation of the match analysis and recommendation",
                },
              },
              required: [
                "overall_match_score",
                "skills_match",
                "experience_match",
                "education_match",
                "matched_skills",
                "missing_skills",
                "strengths",
                "concerns",
                "recommendation",
                "detailed_analysis",
              ],
            },
          },
        ],
      },
    ];
  }

  /**
   * Validate AI screening results
   */
  private validateScreeningResult(args: any): ResumeScreeningResult {
    // Validate scores are in range
    const scores = [
      args.overall_match_score,
      args.skills_match,
      args.experience_match,
      args.education_match,
    ];

    for (const score of scores) {
      if (score < 0 || score > 100) {
        throw new ValidationError("Invalid score values (must be 0-100)");
      }
    }

    // Ensure arrays are actually arrays
    if (!Array.isArray(args.matched_skills)) args.matched_skills = [];
    if (!Array.isArray(args.missing_skills)) args.missing_skills = [];
    if (!Array.isArray(args.strengths)) args.strengths = [];
    if (!Array.isArray(args.concerns)) args.concerns = [];

    // Ensure detailed_analysis exists
    if (!args.detailed_analysis || args.detailed_analysis.trim().length === 0) {
      args.detailed_analysis = "Analysis completed.";
    }

    return args as ResumeScreeningResult;
  }
}
