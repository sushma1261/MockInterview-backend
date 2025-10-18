import { Request, Response } from "express";
import redisClient from "../config/redis";
import pool from "../db/pool";
import { ResumeService } from "../services/ResumeService";
import { UserProfileService } from "../services/UserProfileService";

// Initialize services
const userProfileService = new UserProfileService(pool, redisClient);
const resumeService = new ResumeService(pool, redisClient);

// ==================== User Profile Controllers ====================

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    res.json(req.userProfile);
  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const healthCheck = async (req: Request, res: Response) => {
  try {
    res.json({ status: "UserProfileController is healthy" });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { display_name, photo_url } = req.body;

    const updatedProfile = await userProfileService.updateUserProfile(
      req.user.uid,
      { display_name, photo_url }
    );

    if (!updatedProfile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    res.json(updatedProfile);
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteUserProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const deleted = await userProfileService.deleteUserProfile(req.user.uid);

    if (!deleted) {
      return res.status(404).json({ message: "User profile not found" });
    }

    res.json({ message: "User profile deleted successfully" });
  } catch (error) {
    console.error("Error deleting user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ==================== User Preferences Controllers ====================

export const getUserPreferences = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const preferences = await userProfileService.getUserPreferences(
      req.userProfile.id
    );

    if (!preferences) {
      return res.status(404).json({ message: "Preferences not found" });
    }

    res.json(preferences);
  } catch (error) {
    console.error("Error getting user preferences:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateUserPreferences = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const preferences = await userProfileService.updateUserPreferences(
      req.userProfile.id,
      req.body
    );

    if (!preferences) {
      return res.status(404).json({ message: "Preferences not found" });
    }

    res.json(preferences);
  } catch (error) {
    console.error("Error updating user preferences:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ==================== Resume Controllers ====================

export const createResume = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const resume = await resumeService.createResume(
      req.userProfile.id,
      req.body
    );
    res.status(201).json(resume);
  } catch (error) {
    console.error("Error creating resume:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserResumes = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { limit = "50", offset = "0" } = req.query;

    const resumes = await resumeService.getUserResumes(
      req.userProfile.id,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json(resumes);
  } catch (error) {
    console.error("Error getting user resumes:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getPrimaryResume = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const resume = await resumeService.getPrimaryResume(
      req.userProfile.id.toString() as unknown as number
    );

    if (!resume) {
      return res.status(404).json({ message: "No primary resume found" });
    }

    res.json(resume);
  } catch (error) {
    console.error("Error getting primary resume:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getResumeById = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const resumeId = parseInt(req.params.id);
    const resume = await resumeService.getResumeById(
      resumeId,
      req.userProfile.id
    );

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    res.json(resume);
  } catch (error) {
    console.error("Error getting resume:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateResume = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const resumeId = parseInt(req.params.id);
    const resume = await resumeService.updateResume(
      resumeId,
      req.userProfile.id,
      req.body
    );

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    res.json(resume);
  } catch (error) {
    console.error("Error updating resume:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteResume = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const resumeId = parseInt(req.params.id);
    const deleted = await resumeService.deleteResume(
      resumeId,
      req.userProfile.id
    );

    if (!deleted) {
      return res.status(404).json({ message: "Resume not found" });
    }

    res.json({ message: "Resume deleted successfully" });
  } catch (error) {
    console.error("Error deleting resume:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const setPrimaryResume = async (req: Request, res: Response) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const resumeId = parseInt(req.params.id);
    const resume = await resumeService.setPrimaryResume(
      resumeId,
      req.userProfile.id
    );

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    res.json(resume);
  } catch (error) {
    console.error("Error setting primary resume:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
