// src/middleware/auth.ts
import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../config/firebase";
import redisClient from "../config/redis";
import pool from "../db/pool";
import { UserProfileService } from "../services/UserProfileService";

// Extend Express Request type to include user profile
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        name?: string;
        picture?: string;
      };
      userProfile?: {
        id: number;
        firebase_uid: string;
        email: string;
        display_name?: string;
        photo_url?: string;
      };
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authEnabled = process.env.AUTH_ENABLED === "true";
  if (!authEnabled) {
    console.log("Authentication disabled - skipping auth middleware");
    return next();
  }
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = await verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid token" });
  }

  // Attach Firebase user info to request
  req.user = {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
  };

  // Get or create user profile in database
  try {
    const userProfileService = new UserProfileService(pool, redisClient);
    const userProfile = await userProfileService.getOrCreateUserProfile(
      decoded.uid,
      decoded.email || "",
      decoded.name,
      decoded.picture
    );

    req.userProfile = userProfile;
  } catch (error) {
    console.error("Error getting/creating user profile:", error);
    return res.status(500).json({ message: "Error loading user profile" });
  }

  next();
};
