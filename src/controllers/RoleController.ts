import { Request, Response } from "express";
import ServiceFactory from "../services/ServiceFactory";
import {
  AssignRoleDTO,
  ForbiddenError,
  NotFoundError,
  RemoveRoleDTO,
  UserRole,
  ValidationError,
} from "../types/recruitment";

/**
 * Role Controller
 * Handles user role management (admin only, except self-registration as candidate)
 */
export class RoleController {
  private roleService = ServiceFactory.getRoleService();
  private userProfileService = ServiceFactory.getUserProfileService();

  /**
   * GET /api/roles/users/:userId
   * Get user with all their roles
   */
  getUserRoles = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = parseInt(req.params.userId);
      const userWithRoles = await this.roleService.getUserWithRoles(userId);

      res.json({
        success: true,
        user: userWithRoles,
      });
    } catch (error: any) {
      console.error("Error getting user roles:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to get user roles" });
    }
  };

  /**
   * POST /api/roles/assign
   * Assign a role to a user (admin only)
   */
  assignRole = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const roleData: AssignRoleDTO = {
        user_id: req.body.user_id,
        role: req.body.role,
        assigned_by: req.userProfile.id,
        department: req.body.department,
      };

      const userRole = await this.roleService.assignRole(roleData);

      res.status(201).json({
        success: true,
        message: `Role ${roleData.role} assigned successfully`,
        user_role: userRole,
      });
    } catch (error: any) {
      console.error("Error assigning role:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof ForbiddenError) {
        return res.status(403).json({ message: error.message });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to assign role" });
    }
  };

  /**
   * DELETE /api/roles/remove
   * Remove a role from a user (admin only)
   */
  removeRole = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const roleData: RemoveRoleDTO = {
        user_id: req.body.user_id,
        role: req.body.role,
      };

      await this.roleService.removeRole(roleData, req.userProfile.id);

      res.json({
        success: true,
        message: `Role ${roleData.role} removed successfully`,
      });
    } catch (error: any) {
      console.error("Error removing role:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof ForbiddenError) {
        return res.status(403).json({ message: error.message });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to remove role" });
    }
  };

  /**
   * POST /api/roles/register-candidate
   * Self-register as a candidate (no admin required)
   */
  registerAsCandidate = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userRole = await this.roleService.registerAsCandidate(
        req.userProfile.id
      );

      res.status(201).json({
        success: true,
        message: "Successfully registered as candidate",
        user_role: userRole,
      });
    } catch (error: any) {
      console.error("Error registering as candidate:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to register as candidate" });
    }
  };

  /**
   * GET /api/roles/hr-users
   * Get all users with HR role (admin/HR only)
   */
  getHRUsers = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hrUsers = await this.roleService.getUsersByRole(UserRole.HR);

      res.json({
        success: true,
        users: hrUsers,
      });
    } catch (error: any) {
      console.error("Error getting HR users:", error);
      res.status(500).json({ message: "Failed to get HR users" });
    }
  };

  /**
   * GET /api/roles/candidates
   * Get all users with Candidate role (admin/HR only)
   */
  getCandidates = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const candidates = await this.roleService.getUsersByRole(
        UserRole.CANDIDATE
      );

      res.json({
        success: true,
        users: candidates,
      });
    } catch (error: any) {
      console.error("Error getting candidates:", error);
      res.status(500).json({ message: "Failed to get candidates" });
    }
  };

  /**
   * GET /api/roles/admins
   * Get all users with Admin role (admin only)
   */
  getAdmins = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const admins = await this.roleService.getUsersByRole(UserRole.ADMIN);

      res.json({
        success: true,
        users: admins,
      });
    } catch (error: any) {
      console.error("Error getting admins:", error);
      res.status(500).json({ message: "Failed to get admins" });
    }
  };

  /**
   * GET /api/roles/check
   * Check if current user has a specific role
   */
  checkRole = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const role = req.query.role as UserRole;

      if (!role) {
        return res.status(400).json({ message: "Role parameter is required" });
      }

      const hasRole = await this.roleService.hasRole(req.userProfile.id, role);

      res.json({
        success: true,
        has_role: hasRole,
        role,
      });
    } catch (error: any) {
      console.error("Error checking role:", error);
      res.status(500).json({ message: "Failed to check role" });
    }
  };

  /**
   * GET /api/roles/my-roles
   * Get current user's roles
   */
  getMyRoles = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userWithRoles = await this.roleService.getUserWithRoles(
        req.userProfile.id
      );

      res.json({
        success: true,
        roles: userWithRoles.roles,
        user: userWithRoles,
      });
    } catch (error: any) {
      console.error("Error getting my roles:", error);
      res.status(500).json({ message: "Failed to get your roles" });
    }
  };

  /**
   * GET /api/roles/users
   * Get all users with their roles (admin only)
   * Supports optional search query parameter and pagination
   */
  getAllUsers = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const searchQuery = req.query.search as string | undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string)
        : undefined;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined;

      // Validate pagination parameters
      if (limit !== undefined && (isNaN(limit) || limit < 1)) {
        return res.status(400).json({
          message: "Invalid limit parameter. Must be a positive number.",
        });
      }

      if (offset !== undefined && (isNaN(offset) || offset < 0)) {
        return res.status(400).json({
          message: "Invalid offset parameter. Must be a non-negative number.",
        });
      }

      const result = await this.userProfileService.getAllUsersWithRoles(
        searchQuery,
        limit,
        offset
      );

      res.json({
        success: true,
        users: result.users,
        total: result.total,
        count: result.users.length,
        limit: limit || null,
        offset: offset || 0,
        search: searchQuery || null,
      });
    } catch (error: any) {
      console.error("Error getting all users:", error);
      res.status(500).json({ message: "Failed to get users" });
    }
  };

  /**
   * GET /api/roles/users/search
   * Search users by email, name, or Firebase UID (admin only)
   */
  searchUsers = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const searchQuery = req.query.q as string;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string)
        : undefined;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined;

      if (!searchQuery || searchQuery.trim() === "") {
        return res.status(400).json({
          message: "Search query is required. Use ?q=searchTerm",
        });
      }

      // Validate pagination parameters
      if (limit !== undefined && (isNaN(limit) || limit < 1)) {
        return res.status(400).json({
          message: "Invalid limit parameter. Must be a positive number.",
        });
      }

      if (offset !== undefined && (isNaN(offset) || offset < 0)) {
        return res.status(400).json({
          message: "Invalid offset parameter. Must be a non-negative number.",
        });
      }

      const result = await this.userProfileService.searchUsers(
        searchQuery,
        limit,
        offset
      );

      res.json({
        success: true,
        users: result.users,
        total: result.total,
        count: result.users.length,
        limit: limit || null,
        offset: offset || 0,
        query: searchQuery,
      });
    } catch (error: any) {
      console.error("Error searching users:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  };

  /**
   * PUT /api/roles/users/:userId/role
   * Update a user's role (admin only)
   */
  updateUserRole = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = parseInt(req.params.userId);
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({ message: "Role is required" });
      }

      // Validate role
      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({
          message: "Invalid role. Must be one of: candidate, hr, admin",
        });
      }

      // First remove all existing roles for this user
      const existingUser = await this.roleService.getUserWithRoles(userId);

      for (const existingRoleName of existingUser.roles) {
        await this.roleService.removeRole(
          { user_id: userId, role: existingRoleName as UserRole },
          req.userProfile.id
        );
      }

      // Then assign the new role
      const roleData: AssignRoleDTO = {
        user_id: userId,
        role,
        assigned_by: req.userProfile.id,
      };

      const userRole = await this.roleService.assignRole(roleData);

      res.json({
        success: true,
        message: `User role updated to ${role} successfully`,
        user_role: userRole,
      });
    } catch (error: any) {
      console.error("Error updating user role:", error);
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof ForbiddenError) {
        return res.status(403).json({ message: error.message });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update user role" });
    }
  };

  /**
   * POST /api/roles/users/bulk-update
   * Bulk update user roles (admin only)
   */
  bulkUpdateUserRoles = async (req: Request, res: Response) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { updates } = req.body;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          message: "Updates array is required and must not be empty",
        });
      }

      // Validate each update
      for (const update of updates) {
        if (!update.userId || !update.roles) {
          return res.status(400).json({
            message: "Each update must have userId and roles (array)",
          });
        }

        if (!Array.isArray(update.roles) || update.roles.length === 0) {
          return res.status(400).json({
            message: "roles must be a non-empty array",
          });
        }

        // Validate each role in the array
        for (const role of update.roles) {
          if (!Object.values(UserRole).includes(role)) {
            return res.status(400).json({
              message: `Invalid role: ${role}. Must be one of: candidate, hr, admin`,
            });
          }
        }
      }

      const results = {
        successful: 0,
        failed: 0,
        details: [] as Array<{
          userId: number;
          success: boolean;
          roles?: UserRole[];
          error?: string;
        }>,
      };

      // Process each update
      for (const update of updates) {
        try {
          const userId = parseInt(update.userId.toString());

          // First remove all existing roles for this user
          const existingUser = await this.roleService.getUserWithRoles(userId);

          for (const existingRoleName of existingUser.roles) {
            await this.roleService.removeRole(
              { user_id: userId, role: existingRoleName as UserRole },
              req.userProfile.id
            );
          }

          // Then assign all new roles
          for (const role of update.roles) {
            const roleData: AssignRoleDTO = {
              user_id: userId,
              role,
              assigned_by: req.userProfile.id,
            };

            await this.roleService.assignRole(roleData);
          }

          results.successful++;
          results.details.push({
            userId,
            success: true,
            roles: update.roles,
          });
        } catch (error: any) {
          results.failed++;
          results.details.push({
            userId: parseInt(update.userId.toString()),
            success: false,
            error: error.message || "Failed to update roles",
          });
        }
      }

      res.json({
        success: true,
        message: "Bulk role update completed",
        results,
      });
    } catch (error: any) {
      console.error("Error in bulk update user roles:", error);
      res.status(500).json({ message: "Failed to bulk update user roles" });
    }
  };
}
