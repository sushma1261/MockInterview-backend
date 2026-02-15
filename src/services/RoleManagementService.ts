import pool from "../db/pool";
import {
  AssignRoleDTO,
  ForbiddenError,
  NotFoundError,
  RemoveRoleDTO,
  UserRole,
  UserRoleRecord,
  UserWithRoles,
  ValidationError,
} from "../types/recruitment";
import { cacheDel, cacheGet, cacheSet } from "../utils/cache";

/**
 * Role Management Service
 * Handles user role assignments and checks
 */
export class RoleManagementService {
  /**
   * Check if user has a specific role
   */
  async hasRole(userId: number, role: UserRole): Promise<boolean> {
    const cacheKey = `user:${userId}:hasRole:${role}`;
    const cached = await cacheGet<boolean>(cacheKey);
    if (cached !== null) return cached;

    const query = `SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2`;
    const result = await pool.query(query, [userId, role]);
    const has = result.rows.length > 0;
    await cacheSet(cacheKey, has, 60); // cache for 60s
    return has;
  }

  /**
   * Check if user has any of the specified roles
   */
  async hasAnyRole(userId: number, roles: UserRole[]): Promise<boolean> {
    const query = `SELECT 1 FROM user_roles WHERE user_id = $1 AND role = ANY($2)`;
    const result = await pool.query(query, [userId, roles]);
    return result.rows.length > 0;
  }

  /**
   * Get all roles for a user
   */
  async getUserRoles(userId: number): Promise<UserRole[]> {
    const cacheKey = `user:${userId}:roles`;
    const cached = await cacheGet<UserRole[]>(cacheKey);
    if (cached) return cached;

    const query = `SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role`;
    const result = await pool.query(query, [userId]);
    const roles = result.rows.map((row) => row.role as UserRole);
    await cacheSet(cacheKey, roles, 60);
    return roles;
  }

  /**
   * Get user with all their roles
   */
  async getUserWithRoles(userId: number): Promise<UserWithRoles> {
    const query = `
      SELECT 
        up.id,
        up.firebase_uid,
        up.email,
        up.display_name,
        up.photo_url,
        up.created_at,
        array_agg(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL) as roles,
        array_agg(DISTINCT ur.department) FILTER (WHERE ur.department IS NOT NULL) as departments
      FROM user_profiles up
      LEFT JOIN user_roles ur ON up.id = ur.user_id
      WHERE up.id = $1
      GROUP BY up.id
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      throw new NotFoundError("User");
    }

    const row = result.rows[0];
    return {
      id: row.id,
      firebase_uid: row.firebase_uid,
      email: row.email,
      display_name: row.display_name,
      photo_url: row.photo_url,
      roles: row.roles || [],
      departments: row.departments || [],
      created_at: row.created_at,
    };
  }

  /**
   * Assign role to user (Admin only)
   */
  async assignRole(data: AssignRoleDTO): Promise<UserRoleRecord> {
    // Check if assigner is admin
    const isAdmin = await this.hasRole(data.assigned_by, UserRole.ADMIN);
    if (!isAdmin) {
      throw new ForbiddenError("Only admins can assign roles");
    }

    // Check if user exists
    const userQuery = await pool.query(
      `SELECT id FROM user_profiles WHERE id = $1`,
      [data.user_id]
    );

    if (userQuery.rows.length === 0) {
      throw new NotFoundError("User");
    }

    const query = `
      INSERT INTO user_roles (user_id, role, department, assigned_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, role) DO UPDATE
      SET department = EXCLUDED.department,
          assigned_by = EXCLUDED.assigned_by,
          assigned_at = NOW(),
          updated_at = NOW()
      RETURNING *
    `;

    const values = [
      data.user_id,
      data.role,
      data.department || null,
      data.assigned_by,
    ];

    try {
      const result = await pool.query(query, values);
      console.log(`✅ Assigned role ${data.role} to user ${data.user_id}`);
      // Invalidate caches for the user
      await cacheDel(`user:${data.user_id}:roles`);
      await cacheDel(`user:${data.user_id}:hasRole:${data.role}`);
      return result.rows[0] as UserRoleRecord;
    } catch (error: any) {
      console.error("Error assigning role:", error);
      throw new Error(`Failed to assign role: ${error.message}`);
    }
  }

  /**
   * Remove role from user (Admin only)
   */
  async removeRole(data: RemoveRoleDTO, removedBy: number): Promise<void> {
    // Check if remover is admin
    const isAdmin = await this.hasRole(removedBy, UserRole.ADMIN);
    if (!isAdmin) {
      throw new ForbiddenError("Only admins can remove roles");
    }

    // Prevent removing admin role from the only admin
    if (data.role === UserRole.ADMIN) {
      const adminCount = await pool.query(
        `SELECT COUNT(*) FROM user_roles WHERE role = 'admin'`
      );
      if (parseInt(adminCount.rows[0].count) <= 1) {
        throw new ValidationError("Cannot remove the last admin");
      }
    }

    const query = `DELETE FROM user_roles WHERE user_id = $1 AND role = $2`;
    await pool.query(query, [data.user_id, data.role]);
    console.log(`🗑️ Removed role ${data.role} from user ${data.user_id}`);
    // Invalidate caches
    await cacheDel(`user:${data.user_id}:roles`);
    await cacheDel(`user:${data.user_id}:hasRole:${data.role}`);
  }

  /**
   * Get all users with a specific role
   */
  async getUsersByRole(role: UserRole): Promise<UserWithRoles[]> {
    const query = `
      SELECT 
        up.id,
        up.firebase_uid,
        up.email,
        up.display_name,
        up.photo_url,
        up.created_at,
        array_agg(DISTINCT ur.role) as roles,
        array_agg(DISTINCT ur.department) FILTER (WHERE ur.department IS NOT NULL) as departments
      FROM user_profiles up
      JOIN user_roles ur ON up.id = ur.user_id
      WHERE up.id IN (
        SELECT user_id FROM user_roles WHERE role = $1
      )
      GROUP BY up.id
      ORDER BY up.created_at DESC
    `;

    const result = await pool.query(query, [role]);

    return result.rows.map((row) => ({
      id: row.id,
      firebase_uid: row.firebase_uid,
      email: row.email,
      display_name: row.display_name,
      photo_url: row.photo_url,
      roles: row.roles || [],
      departments: row.departments || [],
      created_at: row.created_at,
    }));
  }

  /**
   * Get all HR users
   */
  async getHRUsers(): Promise<UserWithRoles[]> {
    return this.getUsersByRole(UserRole.HR);
  }

  /**
   * Get all candidates
   */
  async getCandidates(): Promise<UserWithRoles[]> {
    return this.getUsersByRole(UserRole.CANDIDATE);
  }

  /**
   * Check if this is the first user (should be admin)
   */
  async isFirstUser(): Promise<boolean> {
    const query = `SELECT COUNT(*) FROM user_profiles`;
    const result = await pool.query(query);
    const count = parseInt(result.rows[0].count);
    return count === 0 || count === 1;
  }

  /**
   * Assign candidate role to user (self-registration)
   * Anyone can assign themselves as candidate
   */
  async registerAsCandidate(userId: number): Promise<UserRoleRecord> {
    const query = `
      INSERT INTO user_roles (user_id, role, assigned_by)
      VALUES ($1, $2, $1)
      ON CONFLICT (user_id, role) DO NOTHING
      RETURNING *
    `;

    const result = await pool.query(query, [userId, UserRole.CANDIDATE]);

    if (result.rows.length > 0) {
      console.log(`✅ User ${userId} registered as candidate`);
      return result.rows[0] as UserRoleRecord;
    }

    // Already has candidate role
    const existing = await pool.query(
      `SELECT * FROM user_roles WHERE user_id = $1 AND role = $2`,
      [userId, UserRole.CANDIDATE]
    );

    return existing.rows[0] as UserRoleRecord;
  }
}
