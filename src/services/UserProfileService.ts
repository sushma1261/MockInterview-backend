import { Redis } from "ioredis";
import { Pool } from "pg";
import {
  CreateUserProfileDTO,
  UpdateUserPreferencesDTO,
  UpdateUserProfileDTO,
  UserPreferences,
  UserProfile,
} from "../types/userProfile";

export class UserProfileService {
  private pool: Pool;
  private redis: Redis;
  private readonly CACHE_TTL = 3600; // 1 hour in seconds
  private readonly USER_CACHE_PREFIX = "user:";
  private readonly PREFERENCES_CACHE_PREFIX = "prefs:";

  constructor(pool: Pool, redis: Redis) {
    this.pool = pool;
    this.redis = redis;
  }

  // ==================== User Profile Methods ====================

  /**
   * Get or create user profile by Firebase UID
   */
  async getOrCreateUserProfile(
    firebaseUid: string,
    email: string,
    displayName?: string,
    photoUrl?: string
  ): Promise<UserProfile> {
    // Check cache first
    const cached = await this.getCachedUserProfile(firebaseUid);
    console.log("Cached user profile:", cached);
    if (cached) return cached;

    // Check database
    let user = await this.getUserProfileByFirebaseUid(firebaseUid);
    console.log("Database user profile:", user);
    // Create if doesn't exist
    if (!user) {
      console.log("Creating new user profile for UID:", firebaseUid);
      user = await this.createUserProfile({
        firebase_uid: firebaseUid,
        email,
        display_name: displayName,
        photo_url: photoUrl,
      });
    }

    // Cache the result
    await this.cacheUserProfile(user);
    return user;
  }

  /**
   * Get user profile by Firebase UID
   */
  async getUserProfileByFirebaseUid(
    firebaseUid: string
  ): Promise<UserProfile | null> {
    const cacheKey = `${this.USER_CACHE_PREFIX}${firebaseUid}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query database
    const query = "SELECT * FROM user_profiles WHERE firebase_uid = $1";
    const result = await this.pool.query(query, [firebaseUid]);

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    // Cache it
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(user));

    return user;
  }

  /**
   * Get user profile by ID
   */
  async getUserProfileById(userId: number): Promise<UserProfile | null> {
    const cacheKey = `${this.USER_CACHE_PREFIX}id:${userId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const query = "SELECT * FROM user_profiles WHERE id = $1";
    const result = await this.pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(user));

    return user;
  }

  /**
   * Create new user profile
   */
  async createUserProfile(data: CreateUserProfileDTO): Promise<UserProfile> {
    const query = `
      INSERT INTO user_profiles (firebase_uid, email, display_name, photo_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [
      data.firebase_uid,
      data.email,
      data.display_name || null,
      data.photo_url || null,
    ];

    const result = await this.pool.query(query, values);
    const user = result.rows[0];

    // Create default preferences
    await this.createDefaultPreferences(user.id);

    // Cache the new user
    await this.cacheUserProfile(user);

    return user;
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    firebaseUid: string,
    data: UpdateUserProfileDTO
  ): Promise<UserProfile | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.display_name !== undefined) {
      updates.push(`display_name = $${paramIndex}`);
      values.push(data.display_name);
      paramIndex++;
    }

    if (data.photo_url !== undefined) {
      updates.push(`photo_url = $${paramIndex}`);
      values.push(data.photo_url);
      paramIndex++;
    }

    if (updates.length === 0) {
      return await this.getUserProfileByFirebaseUid(firebaseUid);
    }

    values.push(firebaseUid);
    const query = `
      UPDATE user_profiles
      SET ${updates.join(", ")}
      WHERE firebase_uid = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    // Invalidate cache
    await this.invalidateUserCache(firebaseUid, user.id);
    // Cache updated user
    await this.cacheUserProfile(user);

    return user;
  }

  /**
   * Delete user profile and all related data
   */
  async deleteUserProfile(firebaseUid: string): Promise<boolean> {
    const user = await this.getUserProfileByFirebaseUid(firebaseUid);
    if (!user) return false;

    const query = "DELETE FROM user_profiles WHERE firebase_uid = $1";
    await this.pool.query(query, [firebaseUid]);

    // Invalidate all caches
    await this.invalidateUserCache(firebaseUid, user.id);
    await this.invalidatePreferencesCache(user.id);

    return true;
  }

  // ==================== User Preferences Methods ====================

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: number): Promise<UserPreferences | null> {
    const cacheKey = `${this.PREFERENCES_CACHE_PREFIX}${userId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const query = "SELECT * FROM user_preferences WHERE user_id = $1";
    const result = await this.pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const preferences = result.rows[0];
    await this.redis.setex(
      cacheKey,
      this.CACHE_TTL,
      JSON.stringify(preferences)
    );

    return preferences;
  }

  /**
   * Create default preferences for new user
   */
  async createDefaultPreferences(userId: number): Promise<UserPreferences> {
    const query = `
      INSERT INTO user_preferences (user_id)
      VALUES ($1)
      RETURNING *
    `;

    const result = await this.pool.query(query, [userId]);
    const preferences = result.rows[0];

    // Cache the preferences
    const cacheKey = `${this.PREFERENCES_CACHE_PREFIX}${userId}`;
    await this.redis.setex(
      cacheKey,
      this.CACHE_TTL,
      JSON.stringify(preferences)
    );

    return preferences;
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    userId: number,
    data: UpdateUserPreferencesDTO
  ): Promise<UserPreferences | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.interview_difficulty !== undefined) {
      updates.push(`interview_difficulty = $${paramIndex}`);
      values.push(data.interview_difficulty);
      paramIndex++;
    }

    if (data.interview_duration !== undefined) {
      updates.push(`interview_duration = $${paramIndex}`);
      values.push(data.interview_duration);
      paramIndex++;
    }

    if (data.preferred_languages !== undefined) {
      updates.push(`preferred_languages = $${paramIndex}`);
      values.push(data.preferred_languages);
      paramIndex++;
    }

    if (data.theme !== undefined) {
      updates.push(`theme = $${paramIndex}`);
      values.push(data.theme);
      paramIndex++;
    }

    if (updates.length === 0) {
      return await this.getUserPreferences(userId);
    }

    values.push(userId);
    const query = `
      UPDATE user_preferences
      SET ${updates.join(", ")}
      WHERE user_id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    const preferences = result.rows[0];
    // Invalidate and update cache
    await this.invalidatePreferencesCache(userId);
    const cacheKey = `${this.PREFERENCES_CACHE_PREFIX}${userId}`;
    await this.redis.setex(
      cacheKey,
      this.CACHE_TTL,
      JSON.stringify(preferences)
    );

    return preferences;
  }

  /**
   * Get all users with their roles (Admin only)
   */
  async getAllUsersWithRoles(
    searchQuery?: string,
    limit?: number,
    offset?: number
  ): Promise<{ users: any[]; total: number }> {
    // First, get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT up.id) as total
      FROM user_profiles up
      LEFT JOIN user_roles ur ON up.id = ur.user_id
    `;

    const countValues: any[] = [];

    // Add search filter to count query if provided
    if (searchQuery && searchQuery.trim()) {
      countQuery += `
        WHERE 
          up.email ILIKE $1 
          OR up.display_name ILIKE $1
          OR up.firebase_uid ILIKE $1
      `;
      countValues.push(`%${searchQuery.trim()}%`);
    }

    const countResult = await this.pool.query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].total);

    // Now get the actual data with pagination
    let query = `
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
    `;

    const values: any[] = [];
    let paramIndex = 1;

    // Add search filter if provided
    if (searchQuery && searchQuery.trim()) {
      query += `
        WHERE 
          up.email ILIKE $${paramIndex}
          OR up.display_name ILIKE $${paramIndex}
          OR up.firebase_uid ILIKE $${paramIndex}
      `;
      values.push(`%${searchQuery.trim()}%`);
      paramIndex++;
    }

    query += `
      GROUP BY up.id
      ORDER BY up.created_at DESC
    `;

    // Add pagination
    if (limit !== undefined && limit > 0) {
      query += ` LIMIT $${paramIndex}`;
      values.push(limit);
      paramIndex++;
    }

    if (offset !== undefined && offset >= 0) {
      query += ` OFFSET $${paramIndex}`;
      values.push(offset);
    }

    const result = await this.pool.query(query, values);

    const users = result.rows.map((row) => ({
      id: row.id,
      firebase_uid: row.firebase_uid,
      email: row.email,
      display_name: row.display_name,
      photo_url: row.photo_url,
      roles: row.roles || [],
      departments: row.departments || [],
      created_at: row.created_at,
    }));

    return { users, total };
  }

  /**
   * Search users by email, name, or ID
   */
  async searchUsers(
    searchQuery: string,
    limit?: number,
    offset?: number
  ): Promise<{ users: any[]; total: number }> {
    return this.getAllUsersWithRoles(searchQuery, limit, offset);
  }

  // ==================== Cache Helper Methods ====================

  private async getCachedUserProfile(
    firebaseUid: string
  ): Promise<UserProfile | null> {
    const cacheKey = `${this.USER_CACHE_PREFIX}${firebaseUid}`;
    const cached = await this.redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  }

  private async cacheUserProfile(user: UserProfile): Promise<void> {
    const cacheKeyByUid = `${this.USER_CACHE_PREFIX}${user.firebase_uid}`;
    const cacheKeyById = `${this.USER_CACHE_PREFIX}id:${user.id}`;

    await Promise.all([
      this.redis.setex(cacheKeyByUid, this.CACHE_TTL, JSON.stringify(user)),
      this.redis.setex(cacheKeyById, this.CACHE_TTL, JSON.stringify(user)),
    ]);
  }

  private async invalidateUserCache(
    firebaseUid: string,
    userId: number
  ): Promise<void> {
    const cacheKeyByUid = `${this.USER_CACHE_PREFIX}${firebaseUid}`;
    const cacheKeyById = `${this.USER_CACHE_PREFIX}id:${userId}`;

    await Promise.all([
      this.redis.del(cacheKeyByUid),
      this.redis.del(cacheKeyById),
    ]);
  }

  private async invalidatePreferencesCache(userId: number): Promise<void> {
    const cacheKey = `${this.PREFERENCES_CACHE_PREFIX}${userId}`;
    await this.redis.del(cacheKey);
  }
}
