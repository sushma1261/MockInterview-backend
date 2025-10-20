# Oracle Vault Integration Guide

This guide explains how to use Oracle Cloud Vault to securely manage secrets and environment variables for the MockInterview backend application.

## Overview

Oracle Cloud Vault provides centralized secrets management with:
- Hardware Security Module (HSM) protection
- Automatic secret rotation
- Audit logging
- Access control via IAM policies
- **20 free HSM-protected key versions** and **150 free secrets** in Always Free tier

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setting Up Oracle Vault](#setting-up-oracle-vault)
3. [Creating Secrets](#creating-secrets)
4. [Configuring Application](#configuring-application)
5. [Deployment Integration](#deployment-integration)
6. [Best Practices](#best-practices)

---

## Prerequisites

### 1. Install OCI CLI

```bash
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

### 2. Configure OCI CLI

```bash
oci setup config
```

You'll need:
- User OCID
- Tenancy OCID
- Region
- API key (will be generated during setup)

### 3. Install Node.js OCI SDK

```bash
npm install oci-vault oci-secrets oci-common --save
```

---

## Setting Up Oracle Vault

### Step 1: Create a Vault

1. **Via Console:**
   - Navigate to: **Identity & Security** → **Vault**
   - Click **Create Vault**
   - Name: `mockinterview-vault`
   - Create in your home region (for Always Free)
   - Select **Virtual Private Vault** (not included in free tier) or regular vault

2. **Via OCI CLI:**

```bash
# Set your compartment OCID
COMPARTMENT_ID="ocid1.compartment.oc1..your-compartment-id"

# Create vault
oci kms management vault create \
  --compartment-id $COMPARTMENT_ID \
  --display-name "mockinterview-vault" \
  --vault-type DEFAULT
```

### Step 2: Create a Master Encryption Key

1. **Via Console:**
   - Open your vault
   - Click **Master Encryption Keys** → **Create Key**
   - Name: `mockinterview-master-key`
   - Protection Mode: **HSM** (for Always Free, 20 versions included)
   - Algorithm: **AES** (256-bit)

2. **Via OCI CLI:**

```bash
# Get vault ID from previous step
VAULT_ID="ocid1.vault.oc1..your-vault-id"

# Create master key
oci kms management key create \
  --compartment-id $COMPARTMENT_ID \
  --display-name "mockinterview-master-key" \
  --key-shape '{"algorithm":"AES","length":32}' \
  --management-endpoint "https://your-vault-management-endpoint"
```

---

## Creating Secrets

### Secret Schema

Create the following secrets in your vault:

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `mockinterview-postgres-password` | PostgreSQL password | `SecureP@ssw0rd123!` |
| `mockinterview-google-api-key` | Google AI API Key | `AIzaSyC...` |
| `mockinterview-firebase-private-key` | Firebase private key | `-----BEGIN PRIVATE KEY-----\n...` |
| `mockinterview-firebase-client-email` | Firebase client email | `firebase@project.iam.gserviceaccount.com` |
| `mockinterview-firebase-project-id` | Firebase project ID | `your-project-id` |

### Creating Secrets via Console

1. Navigate to your vault
2. Click **Secrets** → **Create Secret**
3. Fill in:
   - **Name**: `mockinterview-postgres-password`
   - **Encryption Key**: Select your master key
   - **Secret Contents**: Your actual secret value
   - **Description**: Brief description
4. Repeat for all secrets

### Creating Secrets via OCI CLI

```bash
# Get key OCID
KEY_ID="ocid1.key.oc1..your-key-id"

# Create PostgreSQL password secret
oci vault secret create-base64 \
  --compartment-id $COMPARTMENT_ID \
  --secret-name "mockinterview-postgres-password" \
  --vault-id $VAULT_ID \
  --key-id $KEY_ID \
  --secret-content-content "$(echo -n 'SecureP@ssw0rd123!' | base64)"

# Create Google API Key secret
oci vault secret create-base64 \
  --compartment-id $COMPARTMENT_ID \
  --secret-name "mockinterview-google-api-key" \
  --vault-id $VAULT_ID \
  --key-id $KEY_ID \
  --secret-content-content "$(echo -n 'your-google-api-key' | base64)"

# Create Firebase secrets
oci vault secret create-base64 \
  --compartment-id $COMPARTMENT_ID \
  --secret-name "mockinterview-firebase-project-id" \
  --vault-id $VAULT_ID \
  --key-id $KEY_ID \
  --secret-content-content "$(echo -n 'your-project-id' | base64)"

oci vault secret create-base64 \
  --compartment-id $COMPARTMENT_ID \
  --secret-name "mockinterview-firebase-client-email" \
  --vault-id $VAULT_ID \
  --key-id $KEY_ID \
  --secret-content-content "$(echo -n 'firebase@project.iam.gserviceaccount.com' | base64)"

# For multi-line secrets like Firebase private key
oci vault secret create-base64 \
  --compartment-id $COMPARTMENT_ID \
  --secret-name "mockinterview-firebase-private-key" \
  --vault-id $VAULT_ID \
  --key-id $KEY_ID \
  --secret-content-content "$(cat firebase-key.pem | base64)"
```

### Bulk Secret Creation Script

Create `scripts/create-vault-secrets.sh`:

```bash
#!/bin/bash
# This script is created in the next step
```

---

## Configuring Application

### Environment Variables for Vault Access

Create `.env.vault` file (DO NOT commit this):

```bash
# Oracle Cloud Configuration
OCI_CONFIG_FILE=/app/.oci/config
OCI_CONFIG_PROFILE=DEFAULT

# Vault Configuration
OCI_VAULT_ID=ocid1.vault.oc1..your-vault-id
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..your-compartment-id

# Secret OCIDs (or names if using by name)
SECRET_POSTGRES_PASSWORD_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_GOOGLE_API_KEY_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_FIREBASE_PROJECT_ID_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_FIREBASE_CLIENT_EMAIL_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_FIREBASE_PRIVATE_KEY_OCID=ocid1.vaultsecret.oc1..xxx
```

### IAM Policy for Compute Instance

Create a dynamic group and policy to allow your compute instance to access Vault:

```bash
# Create dynamic group (via Console or CLI)
# Rule: ANY {instance.compartment.id = 'ocid1.compartment.oc1..xxx'}

# Create policy
oci iam policy create \
  --compartment-id $COMPARTMENT_ID \
  --name "mockinterview-vault-access-policy" \
  --description "Allow compute instances to read vault secrets" \
  --statements '[
    "Allow dynamic-group mockinterview-instances to read secret-family in compartment id <compartment-ocid>",
    "Allow dynamic-group mockinterview-instances to read vaults in compartment id <compartment-ocid>",
    "Allow dynamic-group mockinterview-instances to read keys in compartment id <compartment-ocid>"
  ]'
```

---

## Deployment Integration

### Using the Vault Secrets Service

The application includes `src/config/OracleVaultService.ts` that:
1. Connects to Oracle Vault using instance principal authentication
2. Retrieves secrets at startup
3. Caches secrets in memory
4. Provides a fallback to environment variables

### Startup Process

1. Application starts
2. OracleVaultService initializes
3. Secrets are fetched from Vault
4. Secrets are injected into `process.env`
5. Application continues with normal initialization

### Docker Deployment with Vault

The updated `docker-compose.vault.yaml` includes:
- OCI configuration volume mount
- Instance principal authentication setup
- Vault service initialization

---

## Best Practices

### 1. Secret Rotation

```bash
# Rotate a secret (creates new version)
oci vault secret update-base64 \
  --secret-id $SECRET_ID \
  --secret-content-content "$(echo -n 'new-password' | base64)"
```

### 2. Access Logging

Enable audit logging for vault access:
- Navigate to: **Governance & Administration** → **Audit**
- Filter by service: **Vault**
- Monitor secret access patterns

### 3. Least Privilege

- Create separate dynamic groups per application
- Grant only necessary permissions
- Use compartments to isolate resources

### 4. Secret Versioning

- Vault automatically versions secrets
- Previous versions remain accessible
- Applications can specify version or use latest

### 5. Backup Secrets

```bash
# Export secrets for backup (encrypted)
./scripts/backup-vault-secrets.sh
```

### 6. Development vs Production

- Use separate vaults for dev/staging/prod
- Use different compartments
- Never share production secrets

### 7. Monitoring

Set up alarms for:
- Failed authentication attempts
- Unusual secret access patterns
- Key rotation events

---

## Troubleshooting

### Issue: "Authentication failed"

**Solution:**
```bash
# Verify OCI config
oci session validate --config-file ~/.oci/config --profile DEFAULT

# Check instance principal
curl -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/
```

### Issue: "Secret not found"

**Solution:**
```bash
# List all secrets in vault
oci vault secret list --compartment-id $COMPARTMENT_ID --vault-id $VAULT_ID

# Verify secret OCID
oci vault secret get --secret-id $SECRET_ID
```

### Issue: "Permission denied"

**Solution:**
- Verify dynamic group membership
- Check IAM policies
- Ensure compute instance is in correct compartment

---

## Cost Management

### Always Free Limits

- ✅ 20 HSM-protected key versions (FREE)
- ✅ 150 secrets (FREE)
- ✅ All software-protected keys (FREE)

### Staying Within Free Tier

- Use one master key with multiple secrets
- Avoid creating too many key versions
- Monitor usage in billing dashboard

---

## Security Checklist

- [ ] Vault created in home region
- [ ] Master encryption key created (HSM-protected)
- [ ] All secrets created and encrypted
- [ ] IAM policies configured with least privilege
- [ ] Dynamic group created for compute instances
- [ ] Audit logging enabled
- [ ] OCI CLI configured with API keys
- [ ] Application tested with Vault integration
- [ ] Secret rotation strategy documented
- [ ] Backup procedures established

---

## Quick Reference Commands

```bash
# List vaults
oci kms management vault list --compartment-id $COMPARTMENT_ID

# List secrets
oci vault secret list --compartment-id $COMPARTMENT_ID

# Get secret value
SECRET_BUNDLE=$(oci secrets secret-bundle get --secret-id $SECRET_ID)
echo $SECRET_BUNDLE | jq -r '.data."secret-bundle-content".content' | base64 -d

# Update secret
oci vault secret update-base64 \
  --secret-id $SECRET_ID \
  --secret-content-content "$(echo -n 'new-value' | base64)"

# Test from instance
curl http://169.254.169.254/opc/v2/instance/ -H "Authorization: Bearer Oracle"
```

---

## Next Steps

1. ✅ Set up Oracle Vault and create secrets
2. ✅ Configure IAM policies
3. ✅ Test locally with OCI CLI
4. ✅ Deploy to compute instance
5. ✅ Verify secrets are loaded correctly
6. ✅ Set up monitoring and alerts
7. ✅ Document secret rotation procedures

For more information, see:
- [Oracle Vault Documentation](https://docs.oracle.com/en-us/iaas/Content/KeyManagement/home.htm)
- [OCI SDK for Node.js](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/typescriptsdk.htm)
- [Instance Principal Authentication](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/callingservicesfrominstances.htm)
