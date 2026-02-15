import pool from "../db/pool";
import {
  CandidatePreview,
  NotFoundError,
  ResumeScreeningResult,
} from "../types/recruitment";
import { getTextEmbeddingsAPI } from "../utils/chatUtils";
import { AIScreeningAgent } from "./AIScreeningAgent";

interface ScreeningOptions {
  maxCandidates?: number; // Top N candidates to screen
  similarityThreshold?: number; // Min vector similarity (0-1)
  batchSize?: number; // Process N resumes at a time
}

interface VectorSearchResult {
  id: number;
  user_id: number;
  title: string;
  content: string;
  similarity_score: number;
}

/**
 * Resume Screening Service
 * Orchestrates vector similarity search + AI detailed analysis
 */
export class ResumeScreeningService {
  private aiAgent: AIScreeningAgent;

  constructor() {
    this.aiAgent = new AIScreeningAgent();
  }

  /**
   * Screen all candidate resumes for a job (returns preview results)
   */
  async screenAllResumes(
    jobDescriptionId: number,
    options: ScreeningOptions = {}
  ): Promise<{
    total_resumes_found: number;
    candidates_screened: number;
    candidates: Array<{
      resume: VectorSearchResult;
      result: ResumeScreeningResult;
    }>;
  }> {
    const {
      maxCandidates = 10,
      similarityThreshold = 0.6,
      batchSize = 5,
    } = options;

    try {
      // Step 1: Get job description from database
      const jdQuery = await pool.query(
        `SELECT * FROM job_descriptions WHERE id = $1`,
        [jobDescriptionId]
      );

      if (jdQuery.rows.length === 0) {
        throw new NotFoundError("Job description");
      }

      const jobDescription = jdQuery.rows[0];
      console.log(`🔍 Starting screening for: ${jobDescription.title}`);

      // Step 2: Vector similarity search (fast filter) - ONLY CANDIDATES
      console.log(`📊 Phase 1: Vector similarity search (candidates only)...`);
      const similarResumeIds = await this.findSimilarCandidateResumes(
        jobDescription,
        similarityThreshold,
        maxCandidates
      );

      console.log(
        `✅ Found ${similarResumeIds.length} similar candidate resumes`
      );

      if (similarResumeIds.length === 0) {
        return {
          total_resumes_found: 0,
          candidates_screened: 0,
          candidates: [],
        };
      }

      // Step 3: Fetch full resume data (only candidates)
      const resumesQuery = await pool.query(
        `
        SELECT r.id, r.user_id, r.title, r.content 
        FROM resumes r
        INNER JOIN user_roles ur ON r.user_id = ur.user_id
        WHERE r.id = ANY($1)
          AND ur.role = 'candidate'
        `,
        [similarResumeIds]
      );

      const resumes = resumesQuery.rows;
      console.log(`📄 Fetched ${resumes.length} candidate resumes`);

      if (resumes.length === 0) {
        console.log("⚠️ No candidate resumes found with required role");
        return {
          total_resumes_found: 0,
          candidates_screened: 0,
          candidates: [],
        };
      }

      // Step 4: AI screening in batches
      console.log(
        `🤖 Phase 2: AI detailed analysis (batch size: ${batchSize})...`
      );

      const screeningResults: Array<{
        resume: VectorSearchResult;
        result: ResumeScreeningResult;
      }> = [];
      for (let i = 0; i < resumes.length; i += batchSize) {
        const batch = resumes.slice(i, i + batchSize);
        console.log(
          `  Processing batch ${i / batchSize + 1}/${Math.ceil(
            resumes.length / batchSize
          )}`
        );

        // Process batch in parallel (but limit to batchSize)
        const batchResults = await Promise.allSettled(
          batch.map(async (resume) => {
            try {
              const result = await this.aiAgent.screenResume(
                resume.content,
                jobDescription
              );
              return { resume, result };
            } catch (error: any) {
              console.error(
                `❌ Failed to screen resume ${resume.id}:`,
                error.message
              );
              return null;
            }
          })
        );

        // Extract successful results
        batchResults.forEach((promiseResult) => {
          if (promiseResult.status === "fulfilled" && promiseResult.value) {
            screeningResults.push(promiseResult.value);
          }
        });

        // Rate limiting: wait 1 second between batches
        if (i + batchSize < resumes.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(
        `✅ Successfully screened ${screeningResults.length} resumes`
      );

      return {
        total_resumes_found: resumes.length,
        candidates_screened: screeningResults.length,
        candidates: screeningResults,
      };
    } catch (error: any) {
      console.error("❌ Screening failed:", error);
      throw error;
    }
  }

  /**
   * Vector similarity search - ONLY searches candidate resumes
   */
  private async findSimilarCandidateResumes(
    jobDescription: any,
    threshold: number,
    limit: number
  ): Promise<number[]> {
    try {
      // Generate embedding for job description
      const jdText = `${jobDescription.title}\n${jobDescription.description}\n${
        jobDescription.requirements || ""
      }`;
      const embeddings = getTextEmbeddingsAPI();
      // embedQuery returns number[] directly (CustomGoogleGenAIEmbeddings from chatUtils)
      const jdEmbedding = await embeddings.embedQuery(jdText);

      // Query pgvector for similar resumes - ONLY FROM CANDIDATES
      const query = `
        SELECT DISTINCT r.id,
               MAX(1 - (rc.embedding <=> $1::vector)) AS max_similarity
        FROM resumes r
        INNER JOIN resume_chunks rc ON r.id = rc.resume_id
        INNER JOIN user_roles ur ON r.user_id = ur.user_id
        WHERE rc.embedding IS NOT NULL
          AND ur.role = 'candidate'
        GROUP BY r.id
        HAVING MAX(1 - (rc.embedding <=> $1::vector)) > $2
        ORDER BY max_similarity DESC
        LIMIT $3
      `;

      const result = await pool.query(query, [
        `[${jdEmbedding.join(",")}]`,
        threshold,
        limit,
      ]);

      return result.rows.map((row) => row.id);
    } catch (error: any) {
      console.error("Vector search error:", error);
      throw error;
    }
  }

  /**
   * Convert screening results to candidate preview format
   */
  async convertToCandidatePreviews(
    screeningResults: Array<{
      resume: VectorSearchResult;
      result: ResumeScreeningResult;
    }>
  ): Promise<CandidatePreview[]> {
    const resumeIds = screeningResults.map((r) => r.resume.id);

    // Fetch user details for candidates
    const usersQuery = await pool.query(
      `
      SELECT 
        r.id as resume_id,
        r.user_id,
        up.email,
        up.display_name
      FROM resumes r
      JOIN user_profiles up ON r.user_id = up.id
      WHERE r.id = ANY($1)
      `,
      [resumeIds]
    );

    const usersMap = new Map(
      usersQuery.rows.map((row) => [row.resume_id, row])
    );

    return screeningResults.map((sr) => {
      const userInfo = usersMap.get(sr.resume.id);

      return {
        resume_id: sr.resume.id,
        user_id: sr.resume.user_id,
        candidate_name: userInfo?.display_name || "Unknown",
        candidate_email: userInfo?.email || "",
        resume_title: sr.resume.title,
        ai_match_score: sr.result.overall_match_score,
        recommendation: sr.result.recommendation,
        preview_analysis: {
          matched_skills: sr.result.matched_skills,
          missing_skills: sr.result.missing_skills,
          strengths: sr.result.strengths,
          concerns: sr.result.concerns,
        },
      };
    });
  }

  /**
   * Calculate summary statistics from screening results
   */
  calculateSummary(results: ResumeScreeningResult[]) {
    const summary = {
      strong_match: 0,
      good_match: 0,
      moderate_match: 0,
      weak_match: 0,
    };

    const distribution: { [key: string]: number } = {
      "90-100": 0,
      "80-89": 0,
      "70-79": 0,
      "60-69": 0,
      "50-59": 0,
      "40-49": 0,
      "30-39": 0,
      "20-29": 0,
      "0-19": 0,
    };

    results.forEach((result) => {
      const score = result.overall_match_score;

      // Update summary
      if (score >= 80) summary.strong_match++;
      else if (score >= 60) summary.good_match++;
      else if (score >= 40) summary.moderate_match++;
      else summary.weak_match++;

      // Update distribution
      if (score >= 90) distribution["90-100"]++;
      else if (score >= 80) distribution["80-89"]++;
      else if (score >= 70) distribution["70-79"]++;
      else if (score >= 60) distribution["60-69"]++;
      else if (score >= 50) distribution["50-59"]++;
      else if (score >= 40) distribution["40-49"]++;
      else if (score >= 30) distribution["30-39"]++;
      else if (score >= 20) distribution["20-29"]++;
      else distribution["0-19"]++;
    });

    return { summary, distribution };
  }

  /**
   * Generate suggested actions based on screening results
   */
  generateSuggestedActions(
    results: ResumeScreeningResult[],
    applicationThreshold: number
  ) {
    const aboveThreshold = results.filter(
      (r) => r.overall_match_score >= applicationThreshold
    );

    return {
      recommended_threshold: applicationThreshold,
      recommended_count: aboveThreshold.length,
      message:
        aboveThreshold.length > 0
          ? `We recommend reviewing the top ${aboveThreshold.length} candidates with scores above ${applicationThreshold}`
          : `No candidates meet the threshold of ${applicationThreshold}. Consider lowering the threshold or refining the job description.`,
    };
  }
}
