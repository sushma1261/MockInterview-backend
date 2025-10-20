/**
 * Oracle Cloud Vault Service
 *
 * Manages secrets retrieval from Oracle Cloud Vault using instance principal authentication.
 * Provides secure access to sensitive configuration without hardcoding credentials.
 *
 * Features:
 * - Instance principal authentication (no API keys needed on compute instances)
 * - Secret caching for performance
 * - Graceful fallback to environment variables
 * - Automatic secret decoding
 */

import * as common from "oci-common";
import * as secrets from "oci-secrets";

interface SecretMapping {
  envVar: string;
  secretOCID?: string;
}

interface VaultConfig {
  compartmentId: string;
  vaultId?: string;
  useInstancePrincipal: boolean;
  region?: string;
}

class OracleVaultService {
  private secretsClient: secrets.SecretsClient | null = null;
  private secretCache: Map<string, string> = new Map();
  private config: VaultConfig | null = null;
  private initialized = false;

  /**
   * Initialize the vault service with configuration
   */
  async initialize(): Promise<void> {
    try {
      console.log("🔐 Initializing Oracle Vault Service...");

      // Check if vault is configured
      const compartmentId = process.env.OCI_COMPARTMENT_ID;
      const useVault = process.env.USE_ORACLE_VAULT === "true";

      if (!useVault || !compartmentId) {
        console.log(
          "⚠️  Oracle Vault not configured, using environment variables"
        );
        this.initialized = false;
        return;
      }

      this.config = {
        compartmentId,
        vaultId: process.env.OCI_VAULT_ID,
        useInstancePrincipal: process.env.OCI_USE_INSTANCE_PRINCIPAL === "true",
        region: process.env.OCI_REGION,
      };

      // Initialize authentication provider
      let provider: common.AuthenticationDetailsProvider;

      if (this.config.useInstancePrincipal) {
        console.log("🔑 Using instance principal authentication...");
        provider =
          common.ResourcePrincipalAuthenticationDetailsProvider.builder();
      } else {
        console.log("🔑 Using config file authentication...");
        const configFile = process.env.OCI_CONFIG_FILE || "~/.oci/config";
        const profile = process.env.OCI_CONFIG_PROFILE || "DEFAULT";
        provider = new common.ConfigFileAuthenticationDetailsProvider(
          configFile,
          profile
        );
      }

      // Create secrets client
      this.secretsClient = new secrets.SecretsClient({
        authenticationDetailsProvider: provider,
      });

      if (this.config.region) {
        this.secretsClient.region = common.Region.fromRegionId(
          this.config.region
        );
      }

      this.initialized = true;
      console.log("✅ Oracle Vault Service initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Oracle Vault Service:", error);
      console.log("⚠️  Falling back to environment variables");
      this.initialized = false;
    }
  }

  /**
   * Load all required secrets and inject them into environment variables
   */
  async loadSecrets(): Promise<void> {
    if (!this.initialized || !this.secretsClient) {
      console.log("⚠️  Vault not initialized, skipping secret loading");
      return;
    }

    console.log("📥 Loading secrets from Oracle Vault...");

    const secretMappings: SecretMapping[] = [
      {
        envVar: "POSTGRES_PASSWORD",
        secretOCID: process.env.SECRET_POSTGRES_PASSWORD_OCID,
      },
      {
        envVar: "GOOGLE_API_KEY",
        secretOCID: process.env.SECRET_GOOGLE_API_KEY_OCID,
      },
      {
        envVar: "FIREBASE_PROJECT_ID",
        secretOCID: process.env.SECRET_FIREBASE_PROJECT_ID_OCID,
      },
      {
        envVar: "FIREBASE_CLIENT_EMAIL",
        secretOCID: process.env.SECRET_FIREBASE_CLIENT_EMAIL_OCID,
      },
      {
        envVar: "FIREBASE_PRIVATE_KEY",
        secretOCID: process.env.SECRET_FIREBASE_PRIVATE_KEY_OCID,
      },
    ];

    const loadPromises = secretMappings.map((mapping) =>
      this.loadAndInjectSecret(mapping)
    );

    await Promise.all(loadPromises);
    console.log("✅ All secrets loaded successfully");
  }

  /**
   * Load a single secret and inject it into environment
   */
  private async loadAndInjectSecret(mapping: SecretMapping): Promise<void> {
    try {
      // Skip if already set in environment (for local development)
      if (
        process.env[mapping.envVar] &&
        process.env.NODE_ENV === "development"
      ) {
        console.log(
          `ℹ️  ${mapping.envVar} already set in environment, skipping`
        );
        return;
      }

      // Require OCID
      if (!mapping.secretOCID) {
        console.warn(`⚠️  No OCID provided for ${mapping.envVar}`);
        return;
      }

      const secretValue = await this.getSecretByOCID(mapping.secretOCID);

      // Inject into environment
      process.env[mapping.envVar] = secretValue;
      console.log(`✅ Loaded secret: ${mapping.envVar}`);
    } catch (error) {
      console.error(`❌ Failed to load secret ${mapping.envVar}:`, error);
      // Don't throw - allow app to continue with existing env vars
    }
  }

  /**
   * Get secret value by OCID
   */
  private async getSecretByOCID(secretOCID: string): Promise<string> {
    // Check cache first
    if (this.secretCache.has(secretOCID)) {
      return this.secretCache.get(secretOCID)!;
    }

    if (!this.secretsClient) {
      throw new Error("Secrets client not initialized");
    }

    const request: secrets.requests.GetSecretBundleRequest = {
      secretId: secretOCID,
    };

    const response = await this.secretsClient.getSecretBundle(request);
    const secretBundle = response.secretBundle;

    if (!secretBundle.secretBundleContent) {
      throw new Error(`No content found for secret ${secretOCID}`);
    }

    const content =
      secretBundle.secretBundleContent as secrets.models.Base64SecretBundleContentDetails;
    const decodedValue = Buffer.from(content.content || "", "base64").toString(
      "utf-8"
    );

    // Cache the value
    this.secretCache.set(secretOCID, decodedValue);

    return decodedValue;
  }

  /**
   * Get secret value by name - DEPRECATED: Use OCID directly instead
   * This method is kept for backward compatibility but will always throw an error
   */
  private async getSecretByName(secretName: string): Promise<string> {
    throw new Error(
      `getSecretByName is not supported. Please use secret OCID instead for: ${secretName}`
    );
  }

  /**
   * Get a specific secret value (for runtime retrieval)
   * Only supports OCIDs now
   */
  async getSecret(secretOCID: string): Promise<string | null> {
    if (!this.initialized || !this.secretsClient) {
      console.warn("Vault not initialized, cannot retrieve secret");
      return null;
    }

    try {
      if (!secretOCID || !secretOCID.startsWith("ocid1.vaultsecret.")) {
        console.error(
          `Invalid secret OCID format: ${secretOCID}. Must start with 'ocid1.vaultsecret.'`
        );
        return null;
      }
      return await this.getSecretByOCID(secretOCID);
    } catch (error) {
      console.error(`Failed to retrieve secret ${secretOCID}:`, error);
      return null;
    }
  }

  /**
   * Clear the secret cache (useful for secret rotation)
   */
  clearCache(): void {
    this.secretCache.clear();
    console.log("🧹 Secret cache cleared");
  }

  /**
   * Check if vault service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export const vaultService = new OracleVaultService();

// Export class for testing
export default OracleVaultService;
