#!/bin/bash
# Create secrets in Oracle Cloud Vault
# Usage: ./scripts/create-vault-secrets.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 Oracle Vault Secret Creation Script${NC}"
echo "========================================"

# Check if OCI CLI is installed
if ! command -v oci &> /dev/null; then
    echo -e "${RED}❌ OCI CLI is not installed. Please install it first.${NC}"
    echo "Run: bash -c \"\$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)\""
    exit 1
fi

# Load configuration
if [ -f .env.vault ]; then
    echo -e "${GREEN}✅ Loading configuration from .env.vault${NC}"
    source .env.vault
else
    echo -e "${YELLOW}⚠️  .env.vault not found. Please provide the following information:${NC}"
    read -p "Compartment OCID: " OCI_COMPARTMENT_ID
    read -p "Vault OCID: " OCI_VAULT_ID
    read -p "Master Key OCID: " OCI_KEY_ID
fi

# Validate required variables
if [ -z "$OCI_COMPARTMENT_ID" ] || [ -z "$OCI_VAULT_ID" ] || [ -z "$OCI_KEY_ID" ]; then
    echo -e "${RED}❌ Missing required configuration. Please set OCI_COMPARTMENT_ID, OCI_VAULT_ID, and OCI_KEY_ID${NC}"
    exit 1
fi

echo ""
echo "Configuration:"
echo "  Compartment: $OCI_COMPARTMENT_ID"
echo "  Vault: $OCI_VAULT_ID"
echo "  Master Key: $OCI_KEY_ID"
echo ""

# Function to create a secret
create_secret() {
    local secret_name=$1
    local secret_description=$2
    local prompt_message=$3
    
    echo -e "${YELLOW}Creating secret: ${secret_name}${NC}"
    
    # Check if secret already exists
    existing_secret=$(oci vault secret list \
        --compartment-id "$OCI_COMPARTMENT_ID" \
        --vault-id "$OCI_VAULT_ID" \
        --name "$secret_name" \
        --query 'data[0].id' \
        --raw-output 2>/dev/null || echo "")
    
    if [ -n "$existing_secret" ]; then
        echo -e "${YELLOW}⚠️  Secret '$secret_name' already exists with OCID: $existing_secret${NC}"
        read -p "Do you want to update it? (y/n): " update_choice
        if [ "$update_choice" != "y" ]; then
            echo "Skipping..."
            return
        fi
    fi
    
    # Prompt for secret value
    echo "$prompt_message"
    read -s secret_value
    echo ""
    
    if [ -z "$secret_value" ]; then
        echo -e "${YELLOW}⚠️  Empty value provided, skipping...${NC}"
        return
    fi
    
    # Base64 encode the secret
    secret_content=$(echo -n "$secret_value" | base64)
    
    if [ -n "$existing_secret" ]; then
        # Update existing secret
        result=$(oci vault secret update-base64 \
            --secret-id "$existing_secret" \
            --secret-content-content "$secret_content" \
            --query 'data.id' \
            --raw-output 2>&1)
    else
        # Create new secret
        result=$(oci vault secret create-base64 \
            --compartment-id "$OCI_COMPARTMENT_ID" \
            --secret-name "$secret_name" \
            --vault-id "$OCI_VAULT_ID" \
            --key-id "$OCI_KEY_ID" \
            --description "$secret_description" \
            --secret-content-content "$secret_content" \
            --query 'data.id' \
            --raw-output 2>&1)
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Secret created/updated successfully${NC}"
        echo "   OCID: $result"
        echo "SECRET_${secret_name^^}_OCID=$result" >> .env.vault.generated
    else
        echo -e "${RED}❌ Failed to create/update secret: $result${NC}"
    fi
    echo ""
}

# Function to create secret from file
create_secret_from_file() {
    local secret_name=$1
    local secret_description=$2
    local file_path=$3
    
    echo -e "${YELLOW}Creating secret from file: ${secret_name}${NC}"
    
    if [ ! -f "$file_path" ]; then
        echo -e "${RED}❌ File not found: $file_path${NC}"
        return
    fi
    
    # Base64 encode the file content
    secret_content=$(cat "$file_path" | base64)
    
    # Check if secret already exists
    existing_secret=$(oci vault secret list \
        --compartment-id "$OCI_COMPARTMENT_ID" \
        --vault-id "$OCI_VAULT_ID" \
        --name "$secret_name" \
        --query 'data[0].id' \
        --raw-output 2>/dev/null || echo "")
    
    if [ -n "$existing_secret" ]; then
        # Update existing secret
        result=$(oci vault secret update-base64 \
            --secret-id "$existing_secret" \
            --secret-content-content "$secret_content" \
            --query 'data.id' \
            --raw-output 2>&1)
    else
        # Create new secret
        result=$(oci vault secret create-base64 \
            --compartment-id "$OCI_COMPARTMENT_ID" \
            --secret-name "$secret_name" \
            --vault-id "$OCI_VAULT_ID" \
            --key-id "$OCI_KEY_ID" \
            --description "$secret_description" \
            --secret-content-content "$secret_content" \
            --query 'data.id' \
            --raw-output 2>&1)
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Secret created/updated from file successfully${NC}"
        echo "   OCID: $result"
        echo "SECRET_${secret_name^^}_OCID=$result" >> .env.vault.generated
    else
        echo -e "${RED}❌ Failed to create/update secret: $result${NC}"
    fi
    echo ""
}

# Clear generated file
> .env.vault.generated

echo -e "${GREEN}📝 Creating secrets...${NC}"
echo ""

# Create PostgreSQL password
create_secret \
    "mockinterview-postgres-password" \
    "PostgreSQL database password" \
    "Enter PostgreSQL password:"

# Create Google API Key
create_secret \
    "mockinterview-google-api-key" \
    "Google AI API Key for Gemini" \
    "Enter Google API Key:"

# Create Firebase Project ID
create_secret \
    "mockinterview-firebase-project-id" \
    "Firebase Project ID" \
    "Enter Firebase Project ID:"

# Create Firebase Client Email
create_secret \
    "mockinterview-firebase-client-email" \
    "Firebase service account email" \
    "Enter Firebase Client Email:"

# Ask about Firebase private key
echo -e "${YELLOW}Firebase Private Key can be provided in two ways:${NC}"
echo "1. Paste the key directly"
echo "2. Provide path to JSON file"
read -p "Choose option (1 or 2): " fb_key_option

if [ "$fb_key_option" == "2" ]; then
    read -p "Enter path to Firebase JSON file: " fb_json_path
    if [ -f "$fb_json_path" ]; then
        # Extract private key from JSON
        private_key=$(cat "$fb_json_path" | jq -r '.private_key')
        secret_content=$(echo -n "$private_key" | base64)
        
        result=$(oci vault secret create-base64 \
            --compartment-id "$OCI_COMPARTMENT_ID" \
            --secret-name "mockinterview-firebase-private-key" \
            --vault-id "$OCI_VAULT_ID" \
            --key-id "$OCI_KEY_ID" \
            --description "Firebase service account private key" \
            --secret-content-content "$secret_content" \
            --query 'data.id' \
            --raw-output 2>&1)
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Firebase private key created successfully${NC}"
            echo "SECRET_MOCKINTERVIEW_FIREBASE_PRIVATE_KEY_OCID=$result" >> .env.vault.generated
        fi
    else
        echo -e "${RED}❌ File not found${NC}"
    fi
else
    create_secret \
        "mockinterview-firebase-private-key" \
        "Firebase service account private key" \
        "Paste Firebase Private Key (entire key including BEGIN/END lines):"
fi

echo ""
echo -e "${GREEN}✅ Secret creation complete!${NC}"
echo ""
echo -e "${YELLOW}📄 Generated secret OCIDs have been saved to: .env.vault.generated${NC}"
echo -e "${YELLOW}   Copy these to your .env.vault file or use them in your deployment.${NC}"
echo ""
echo "Next steps:"
echo "1. Review .env.vault.generated"
echo "2. Update your .env.vault with the OCIDs"
echo "3. Configure IAM policies for your compute instance"
echo "4. Deploy your application"
echo ""
echo -e "${GREEN}Done! 🎉${NC}"
