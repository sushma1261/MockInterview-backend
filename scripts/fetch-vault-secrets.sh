#!/bin/bash
# Fetch secrets from Oracle Cloud Vault and export as environment variables
# This script is meant to run on the compute instance before starting the application

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔐 Fetching secrets from Oracle Vault...${NC}"

# Check if running on OCI compute instance
if ! curl -s -f -m 5 http://169.254.169.254/opc/v2/instance/ -H "Authorization: Bearer Oracle" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Not running on OCI compute instance or metadata service not available${NC}"
    echo "Using local OCI config..."
fi

# Load vault configuration
if [ -f .env.vault ]; then
    source .env.vault
else
    echo -e "${RED}❌ .env.vault file not found${NC}"
    exit 1
fi

# Function to fetch and decode secret
fetch_secret() {
    local secret_ocid=$1
    local env_var_name=$2
    
    echo -e "${YELLOW}Fetching: ${env_var_name}${NC}"
    
    # Get secret bundle
    secret_bundle=$(oci secrets secret-bundle get \
        --secret-id "$secret_ocid" \
        --query 'data."secret-bundle-content".content' \
        --raw-output 2>&1)
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to fetch secret: $env_var_name${NC}"
        echo "$secret_bundle"
        return 1
    fi
    
    # Decode base64
    secret_value=$(echo "$secret_bundle" | base64 -d)
    
    # Export as environment variable
    export "$env_var_name"="$secret_value"
    
    echo -e "${GREEN}✅ ${env_var_name} loaded${NC}"
}

# Fetch all secrets
if [ -n "$SECRET_POSTGRES_PASSWORD_OCID" ]; then
    fetch_secret "$SECRET_POSTGRES_PASSWORD_OCID" "POSTGRES_PASSWORD"
fi

if [ -n "$SECRET_GOOGLE_API_KEY_OCID" ]; then
    fetch_secret "$SECRET_GOOGLE_API_KEY_OCID" "GOOGLE_API_KEY"
fi

if [ -n "$SECRET_FIREBASE_PROJECT_ID_OCID" ]; then
    fetch_secret "$SECRET_FIREBASE_PROJECT_ID_OCID" "FIREBASE_PROJECT_ID"
fi

if [ -n "$SECRET_FIREBASE_CLIENT_EMAIL_OCID" ]; then
    fetch_secret "$SECRET_FIREBASE_CLIENT_EMAIL_OCID" "FIREBASE_CLIENT_EMAIL"
fi

if [ -n "$SECRET_FIREBASE_PRIVATE_KEY_OCID" ]; then
    fetch_secret "$SECRET_FIREBASE_PRIVATE_KEY_OCID" "FIREBASE_PRIVATE_KEY"
fi

echo -e "${GREEN}✅ All secrets loaded successfully${NC}"

# If running with arguments, execute the command
if [ $# -gt 0 ]; then
    echo -e "${GREEN}🚀 Executing: $@${NC}"
    exec "$@"
fi
