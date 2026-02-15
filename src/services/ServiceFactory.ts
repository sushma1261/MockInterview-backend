import { getRedisClient } from "../config/redis";
import pool from "../db/pool";
import { ResumeService } from "./ResumeService";
import { RoleManagementService } from "./RoleManagementService";
import { UserProfileService } from "./UserProfileService";

/**
 * Service Factory - Singleton Pattern
 * Ensures single instances of services across the application
 * to prevent memory waste and potential state inconsistency
 */
class ServiceFactory {
  private static userProfileService: UserProfileService | null = null;
  private static resumeService: ResumeService | null = null;
  private static roleService: RoleManagementService | null = null;

  /**
   * Get singleton instance of UserProfileService
   */
  static getUserProfileService(): UserProfileService {
    if (!this.userProfileService) {
      this.userProfileService = new UserProfileService(pool, getRedisClient());
    }
    return this.userProfileService;
  }

  /**
   * Get singleton instance of ResumeService
   */
  static getResumeService(): ResumeService {
    if (!this.resumeService) {
      this.resumeService = new ResumeService(pool, getRedisClient());
    }
    return this.resumeService;
  }

  /**
   * Get singleton instance of RoleManagementService
   */
  static getRoleService(): RoleManagementService {
    if (!this.roleService) {
      this.roleService = new RoleManagementService();
    }
    return this.roleService;
  }

  /**
   * Reset all service instances (useful for testing)
   */
  static reset(): void {
    this.userProfileService = null;
    this.resumeService = null;
    this.roleService = null;
  }
}

export default ServiceFactory;
