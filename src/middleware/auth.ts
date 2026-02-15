// src/middleware/auth.ts
import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../config/firebase";
import ServiceFactory from "../services/ServiceFactory";
import { UserRole } from "../types/recruitment";

// Extend Express Request type to include user profile and roles
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
      userRoles?: UserRole[];
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
    const userProfileService = ServiceFactory.getUserProfileService();
    const userProfile = await userProfileService.getOrCreateUserProfile(
      decoded.uid,
      decoded.email || "",
      decoded.name,
      decoded.picture
    );

    req.userProfile = userProfile;

    // Load user roles
    const roleService = ServiceFactory.getRoleService();
    const userWithRoles = await roleService.getUserWithRoles(userProfile.id);
    req.userRoles = userWithRoles.roles;
  } catch (error) {
    console.error("Error getting/creating user profile:", error);
    return res.status(500).json({ message: "Error loading user profile" });
  }

  next();
};

/**
 * Middleware to require specific role(s)
 * Usage: requireRole(UserRole.HR)
 * Usage: requireRole([UserRole.HR, UserRole.ADMIN])
 */
export const requireRole = (allowedRoles: UserRole | UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.userProfile) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const userRoles = req.userRoles || [];

    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        message: "Insufficient permissions",
        required_roles: roles,
        your_roles: userRoles,
      });
    }

    next();
  };
};

/**
 * Middleware to require HR role
 */
export const requireHR = requireRole(UserRole.HR);

/**
 * Middleware to require Admin role
 */
export const requireAdmin = requireRole(UserRole.ADMIN);

/**
 * Middleware to require Candidate role
 */
export const requireCandidate = requireRole(UserRole.CANDIDATE);

/**
 * Middleware to require any of multiple roles
 */
export const requireAnyRole = (...roles: UserRole[]) => requireRole(roles);
