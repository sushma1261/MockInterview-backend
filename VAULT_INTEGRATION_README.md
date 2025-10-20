# Oracle Vault Integration - Overview

This document provides a high-level overview of how Oracle Cloud Vault is integrated into the MockInterview backend application.

## What is Oracle Vault?

Oracle Cloud Vault is a fully managed secrets management service that:
- Stores sensitive data (API keys, passwords, certificates) securely
- Uses Hardware Security Modules (HSMs) for encryption
- Provides centralized secret management across your applications
- Offers automatic secret versioning and rotation
- Includes comprehensive audit logging

## Why Use Vault?

### Security Benefits

1. **No Hardcoded Secrets**: Secrets are never stored in code or configuration files
2. **Encryption at Rest**: All secrets are encrypted using HSM-protected keys
3. **Access Control**: Fine-grained IAM policies control who can access which secrets
4. **Audit Trail**: Complete logging of all secret access
5. **Rotation**: Easy secret rotation without code changes

### Operational Benefits

1. **Centralized Management**: Manage all secrets from one place
2. **Environment Separation**: Different secrets for dev/staging/prod
3. **Team Collaboration**: Share secrets securely with team members
4. **Compliance**: Meet security compliance requirements
5. **Free Tier**: 20 HSM key versions + 150 secrets included free

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OCI Compute Instance                      │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Docker Container (Backend)                 │ │
│  │                                                          │ │
│  │  1. App starts                                          │ │
│  │  2. OracleVaultService.initialize()                     │ │
│  │     │                                                    │ │
│  │     ├─> Uses Instance Principal Auth                    │ │
│  │     │   (No API keys needed!)                           │ │
│  │     │                                                    │ │
│  │     └─> OracleVaultService.loadSecrets()               │ │
│  │         │                                                │ │
│  │         ├─> Fetches: POSTGRES_PASSWORD ──────┐         │ │
│  │         ├─> Fetches: GOOGLE_API_KEY ──────────┼────┐   │ │
│  │         ├─> Fetches: FIREBASE_* ──────────────┘    │   │ │
│  │         │                                           │   │ │
│  │         └─> Injects into process.env              │   │ │
│  │                                                     │   │ │
│  │  3. App continues normal execution                │   │ │
│  │     (All secrets available in process.env)        │   │ │
│  └──────────────────────────────────────────────────┼───┘ │
│                                                       │     │
└───────────────────────────────────────────────────────┼─────┘
                                                        │
                    ┌───────────────────────────────────┘
                    │ HTTPS/TLS
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                    Oracle Cloud Vault                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Master Encryption Key (HSM-protected)              │  │
│  │  └─> AES-256                                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Secrets (Encrypted)                                 │  │
│  │  ├─> mockinterview-postgres-password                │  │
│  │  ├─> mockinterview-google-api-key                   │  │
│  │  ├─> mockinterview-firebase-project-id              │  │
│  │  ├─> mockinterview-firebase-client-email            │  │
│  │  └─> mockinterview-firebase-private-key             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
1. Application starts in Docker container
2. OracleVaultService checks for instance principal metadata
3. Instance queries metadata service at 169.254.169.254
4. Metadata service validates instance is in approved dynamic group
5. Returns temporary credentials (auto-rotated)
6. Application uses credentials to call Vault API
7. Vault checks IAM policies
8. If authorized, returns encrypted secret
9. SDK automatically decrypts using master key
10. Secret value injected into process.env
```

## Integration Points

### 1. Startup Process (`src/index.ts`)

```typescript
// Before starting server
async function initializeApp() {
  await vaultService.initialize();    // Connect to Vault
  await vaultService.loadSecrets();   // Load all secrets
}

initializeApp().then(() => {
  app.listen(PORT);  // Start server with secrets loaded
});
```

### 2. Vault Service (`src/config/OracleVaultService.ts`)

Key responsibilities:
- Initialize OCI SDK with instance principal auth
- Map secret OCIDs to environment variables
- Fetch and decode secrets from Vault
- Cache secrets for performance
- Provide fallback to traditional env vars

### 3. Docker Compose (`docker-compose.vault.yaml`)

Differences from standard deployment:
```yaml
environment:
  # Vault configuration
  USE_ORACLE_VAULT: true
  OCI_USE_INSTANCE_PRINCIPAL: true
  OCI_COMPARTMENT_ID: ${OCI_COMPARTMENT_ID}
  OCI_VAULT_ID: ${OCI_VAULT_ID}
  
  # Secret OCIDs (not the actual secrets!)
  SECRET_POSTGRES_PASSWORD_OCID: ${SECRET_POSTGRES_PASSWORD_OCID}
  SECRET_GOOGLE_API_KEY_OCID: ${SECRET_GOOGLE_API_KEY_OCID}
  # ... more OCIDs
```

### 4. Deployment Script (`scripts/deploy-with-vault.sh`)

Automation that:
- Verifies Vault connectivity
- Tests IAM permissions
- Validates secret OCIDs
- Starts services with Vault integration

## Configuration Files

### `.env.vault` (Not committed to git)

```bash
# Vault connection info
OCI_REGION=us-ashburn-1
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxx
OCI_VAULT_ID=ocid1.vault.oc1..xxx

# Secret references (OCIDs, not actual secrets)
SECRET_POSTGRES_PASSWORD_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_GOOGLE_API_KEY_OCID=ocid1.vaultsecret.oc1..xxx
# ...
```

### `.env.vault.example` (Template, committed to git)

Template with instructions - safe to commit because it contains no actual secrets.

## Secret Management Workflow

### Creating Secrets

```bash
# Interactive script
./scripts/create-vault-secrets.sh

# Prompts for each secret
# Uploads to Vault
# Returns OCIDs to add to .env.vault
```

### Updating Secrets (Rotation)

```bash
# Option 1: Re-run creation script
./scripts/create-vault-secrets.sh
# Select existing secret to update

# Option 2: Use OCI CLI directly
oci vault secret update-base64 \
  --secret-id <secret-ocid> \
  --secret-content-content $(echo -n "new-value" | base64)

# Restart app to pick up new value
docker-compose -f docker-compose.vault.yaml restart backend
```

### Retrieving Secrets (for debugging)

```bash
# Fetch and decode
oci secrets secret-bundle get \
  --secret-id <secret-ocid> \
  --query 'data."secret-bundle-content".content' \
  --raw-output | base64 -d
```

## IAM Configuration

### Dynamic Group

Defines which compute instances can access Vault:

```
Name: mockinterview-instances
Rule: ANY {instance.compartment.id = 'ocid1.compartment.oc1..xxx'}
```

### Policy

Grants permissions to the dynamic group:

```
Allow dynamic-group mockinterview-instances to read secret-family in compartment <name>
Allow dynamic-group mockinterview-instances to read vaults in compartment <name>
Allow dynamic-group mockinterview-instances to read keys in compartment <name>
```

## Development vs Production

### Local Development

```bash
# Don't use Vault locally
USE_ORACLE_VAULT=false

# Use traditional .env file
POSTGRES_PASSWORD=local-password
GOOGLE_API_KEY=your-dev-key
```

### Production (OCI Compute)

```bash
# Use Vault in production
USE_ORACLE_VAULT=true
OCI_USE_INSTANCE_PRINCIPAL=true

# Only OCIDs in config (not actual secrets)
SECRET_POSTGRES_PASSWORD_OCID=ocid1.vaultsecret...
SECRET_GOOGLE_API_KEY_OCID=ocid1.vaultsecret...
```

## Monitoring and Auditing

### Audit Logs

View secret access in OCI Console:
```
Governance & Administration > Audit
Filter by: Service = Vault
```

### Application Logs

```bash
# Startup logs show Vault initialization
docker-compose -f docker-compose.vault.yaml logs backend

# Look for:
# ✅ Oracle Vault Service initialized successfully
# ✅ All secrets loaded successfully
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Authentication failed | Instance not in dynamic group | Add instance to dynamic group |
| Permission denied | Missing IAM policy | Add read permissions to policy |
| Secret not found | Wrong OCID or deleted secret | Verify OCID in .env.vault |
| Timeout | Network issue | Check VCN routing and security lists |

### Debug Commands

```bash
# Test instance principal
curl -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/

# Test OCI CLI
oci iam region list

# List secrets
oci vault secret list --compartment-id $OCI_COMPARTMENT_ID

# Test vault connectivity
oci vault vault get --vault-id $OCI_VAULT_ID
```

## Best Practices

1. **Separate Vaults**: Use different vaults for dev/staging/prod
2. **Least Privilege**: Grant only necessary permissions
3. **Regular Rotation**: Rotate secrets quarterly
4. **Monitor Access**: Review audit logs regularly
5. **Document OCIDs**: Keep secure backup of secret OCIDs
6. **Test Locally**: Verify secrets work before production deployment
7. **Use Versions**: Take advantage of automatic versioning
8. **Cache Wisely**: Balance performance vs freshness

## Migration from .env to Vault

### Step-by-Step Migration

1. **Set up Vault** (one-time)
   - Create vault and master key
   - Configure IAM policies

2. **Create secrets**
   ```bash
   ./scripts/create-vault-secrets.sh
   ```

3. **Update configuration**
   - Copy OCIDs to .env.vault
   - Set `USE_ORACLE_VAULT=true`

4. **Test**
   - Deploy with `./scripts/deploy-with-vault.sh`
   - Verify secrets loaded correctly

5. **Remove old .env** (optional)
   - Keep as backup initially
   - Remove after confirming Vault works

### Rollback Plan

If Vault integration fails:

```bash
# Deploy without Vault
docker-compose -f docker-compose.prod.yaml up -d

# Or disable Vault in config
USE_ORACLE_VAULT=false
```

## Cost Considerations

### Free Tier Limits

- ✅ 20 HSM-protected key versions (FREE)
- ✅ 150 secrets (FREE)
- ✅ Unlimited software-protected keys (FREE)

### Staying Free

- Use one master key for all secrets
- Don't create excessive key versions
- Monitor in billing dashboard

### Overage Costs

If you exceed free tier (unlikely for this app):
- Additional secrets: $0.03/secret/month
- Additional HSM key versions: $1/version/month

## Security Considerations

### What's Protected

✅ Secrets encrypted at rest (HSM)
✅ Secrets encrypted in transit (TLS)
✅ Access controlled (IAM)
✅ All access audited
✅ Automatic key rotation available

### What's Not Protected

❌ Secret OCIDs (not sensitive - they're identifiers)
❌ Vault metadata (names, descriptions)
❌ Audit logs (contains access patterns, not secrets)

### Attack Vectors

- **Compromised instance**: Instance principal limits damage to that instance only
- **Stolen OCIDs**: OCIDs are useless without IAM permissions
- **Insider threat**: Audit logs track all access
- **Network snooping**: All traffic is TLS encrypted

## Further Reading

- **Detailed Setup**: `ORACLE_VAULT_SETUP.md`
- **Quick Start**: `VAULT_QUICK_START.md`
- **Infrastructure**: `ORACLE_DEPLOYMENT_GUIDE.md`
- **Code**: `src/config/OracleVaultService.ts`

---

**Questions?** Check the troubleshooting section or review the detailed guides.
