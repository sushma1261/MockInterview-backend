# Complete Deployment Guide - Oracle Cloud Free Tier

Step-by-step guide to deploy MockInterview backend to Oracle Cloud with Vault integration.

---

## 📋 Pre-Deployment Checklist

- [ ] Oracle Cloud Free Tier account created
- [ ] GitHub repository access
- [ ] Firebase project credentials
- [ ] Google AI API key

---

## Part 1: Oracle Cloud Setup (One-Time)

### Step 1: Create OCI Account

1. Go to [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. Click "Start for free"
3. Complete registration (credit card required but won't be charged)
4. Verify email and activate account

### Step 2: Create Compute Instance

#### 2.1 Navigate to Compute

```
☰ Menu → Compute → Instances → Create Instance
```

#### 2.2 Configure Instance

**Name:** `mockinterview-backend`

**Image:** 
- Click "Change Image"
- Select "Oracle Linux 8" (or Ubuntu 22.04)
- Click "Select Image"

**Shape:**
- Click "Change Shape"
- Select "Ampere" (ARM-based)
- Choose **VM.Standard.A1.Flex**
- Set OCPUs: **2** (or up to 4 for free tier)
- Set Memory: **12 GB** (or up to 24 GB for free tier)
- Click "Select Shape"

**Networking:**
- VCN: Create new VCN or use existing
- Subnet: Public Subnet
- ✅ Assign a public IPv4 address

**SSH Keys:**
- Generate new key pair (download private key!)
- Or upload your existing public key

**Boot Volume:**
- Size: **50 GB** (default)

Click **"Create"** and wait 1-2 minutes for provisioning.

#### 2.3 Note Your Instance Details

Save these values:
- **Public IP Address:** `xxx.xxx.xxx.xxx`
- **Private Key Path:** `~/Downloads/ssh-key-xxx.key`
- **Compartment OCID:** (copy from instance details)

### Step 3: Configure Firewall

#### 3.1 Security List Rules

```
☰ Menu → Networking → Virtual Cloud Networks
→ Select your VCN
→ Security Lists
→ Default Security List
→ Add Ingress Rules
```

**Add these rules:**

| Source CIDR | Protocol | Port | Description |
|-------------|----------|------|-------------|
| 0.0.0.0/0 | TCP | 22 | SSH |
| 0.0.0.0/0 | TCP | 8080 | Application |
| 0.0.0.0/0 | TCP | 80 | HTTP (optional) |
| 0.0.0.0/0 | TCP | 443 | HTTPS (optional) |

#### 3.2 Instance Firewall

Connect to instance and configure:

```bash
# Set correct permissions for SSH key
chmod 400 ~/Downloads/ssh-key-xxx.key

# Connect to instance
ssh -i ~/Downloads/ssh-key-xxx.key opc@YOUR_PUBLIC_IP

# Once connected, configure firewall
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

---

## Part 2: Oracle Vault Setup (Optional but Recommended)

### Step 4: Create Vault

#### 4.1 Create Vault

```
☰ Menu → Identity & Security → Vault → Create Vault
```

**Settings:**
- Name: `mockinterview-vault`
- Compartment: (your compartment)
- ❌ Make it a Virtual Private Vault (uncheck for free tier)

Click **Create Vault**

#### 4.2 Create Master Encryption Key

Open your vault → **Master Encryption Keys** → **Create Key**

**Settings:**
- Name: `mockinterview-master-key`
- Protection Mode: **HSM** (included in free tier)
- Algorithm: **AES**
- Length: **256 bits**

Click **Create Key**

#### 4.3 Copy OCIDs

Save these OCIDs (you'll need them later):
- **Vault OCID:** `ocid1.vault.oc1...`
- **Key OCID:** `ocid1.key.oc1...`
- **Compartment OCID:** `ocid1.compartment.oc1...`

### Step 5: Configure IAM for Vault Access

#### 5.1 Create Dynamic Group

```
☰ Menu → Identity & Security → Dynamic Groups → Create Dynamic Group
```

**Settings:**
- Name: `mockinterview-instances`
- Description: `Instances that can access vault secrets`

**Matching Rules:**
```
ANY {instance.compartment.id = 'YOUR_COMPARTMENT_OCID'}
```

Replace `YOUR_COMPARTMENT_OCID` with your actual compartment OCID.

#### 5.2 Create IAM Policy

```
☰ Menu → Identity & Security → Policies → Create Policy
```

**Settings:**
- Name: `mockinterview-vault-policy`
- Description: `Allow instances to read secrets from vault`
- Compartment: Root (or your compartment)

**Policy Statements:**
```
Allow dynamic-group mockinterview-instances to read secret-family in compartment id YOUR_COMPARTMENT_OCID
Allow dynamic-group mockinterview-instances to read vaults in compartment id YOUR_COMPARTMENT_OCID
Allow dynamic-group mockinterview-instances to read keys in compartment id YOUR_COMPARTMENT_OCID
```

Replace `YOUR_COMPARTMENT_OCID` with your actual compartment OCID.

---

## Part 3: Server Setup

### Step 6: Connect and Install Dependencies

```bash
# Connect to your instance
ssh -i ~/Downloads/ssh-key-xxx.key opc@YOUR_PUBLIC_IP

# Update system
sudo yum update -y

# Install Git
sudo yum install -y git

# Install Docker
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install OCI CLI
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)" -- --accept-all-defaults

# Logout and login again for group changes
exit
```

### Step 7: Clone Repository

```bash
# SSH back in
ssh -i ~/Downloads/ssh-key-xxx.key opc@YOUR_PUBLIC_IP

# Clone your repository
git clone https://github.com/sushma1261/MockInterview-backend.git
cd MockInterview-backend

# Make scripts executable
chmod +x scripts/*.sh
```

---

## Part 4: Configuration

### Option A: Using Oracle Vault (Recommended)

#### Step 8A: Configure Vault Settings

```bash
# Copy vault example
cp .env.vault.example .env.vault

# Edit configuration
nano .env.vault
```

**Fill in these values:**

```bash
# Oracle Cloud Configuration
OCI_REGION=us-ashburn-1  # Your region
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..aaaaaaaa...  # From Step 4.3
OCI_VAULT_ID=ocid1.vault.oc1..aaaaaaaa...  # From Step 4.3
OCI_KEY_ID=ocid1.key.oc1..aaaaaaaa...  # From Step 4.3

# Authentication
OCI_USE_INSTANCE_PRINCIPAL=true
USE_ORACLE_VAULT=true

# Database (non-secret)
POSTGRES_USER=system
POSTGRES_DB=mockinterview

# Authentication
AUTH_ENABLED=true
```

Save and exit (Ctrl+X, Y, Enter)

#### Step 9A: Create Secrets in Vault

```bash
# Run the secret creation script
./scripts/create-vault-secrets.sh
```

The script will prompt you for:

1. **PostgreSQL Password:** Choose a strong password (e.g., `MySecurePass123!`)
2. **Google AI API Key:** Your Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
3. **Firebase Project ID:** From Firebase Console → Project Settings
4. **Firebase Client Email:** From Firebase Console → Service Account
5. **Firebase Private Key:** Paste the entire key or provide path to JSON file

After completion:
```bash
# Copy generated OCIDs to .env.vault
cat .env.vault.generated

# Edit .env.vault and add the OCIDs
nano .env.vault
```

Add the secret OCIDs from `.env.vault.generated`:
```bash
SECRET_POSTGRES_PASSWORD_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_GOOGLE_API_KEY_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_FIREBASE_PROJECT_ID_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_FIREBASE_CLIENT_EMAIL_OCID=ocid1.vaultsecret.oc1..xxx
SECRET_FIREBASE_PRIVATE_KEY_OCID=ocid1.vaultsecret.oc1..xxx
```

### Option B: Using Traditional .env (Simpler)

#### Step 8B: Configure Environment File

```bash
# Copy example
cp .env.example .env

# Edit configuration
nano .env
```

**Fill in all values:**

```bash
# Server Configuration
PORT=8080
BASE_URL=http://YOUR_PUBLIC_IP
NODE_ENV=production

# Authentication
AUTH_ENABLED=true

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=system
POSTGRES_PASSWORD=YourStrongPassword123!
POSTGRES_DB=mockinterview

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Google AI Configuration
GOOGLE_API_KEY=AIzaSyC...your-api-key...
```

---

## Part 5: Deploy Application

### Step 10: Deploy

#### For Vault Deployment (Option A):
```bash
./scripts/deploy-with-vault.sh
```

#### For Traditional Deployment (Option B):
```bash
docker-compose -f docker-compose.prod.yaml up -d
```

The deployment script will:
1. ✅ Check prerequisites
2. ✅ Verify vault connectivity (if using vault)
3. ✅ Build Docker images
4. ✅ Start all services
5. ✅ Run health checks

### Step 11: Verify Deployment

```bash
# Check service status
docker-compose -f docker-compose.vault.yaml ps
# OR
docker-compose -f docker-compose.prod.yaml ps

# View logs
docker-compose logs -f backend

# Test health endpoint
curl http://localhost:8080/health

# Test from outside
curl http://YOUR_PUBLIC_IP:8080/health
```

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T..."
}
```

---

## Part 6: Post-Deployment

### Step 12: Set Up Domain (Optional)

#### 12.1 Configure DNS

Point your domain to your instance's public IP:
```
Type: A Record
Name: api (or @)
Value: YOUR_PUBLIC_IP
TTL: 300
```

#### 12.2 Install SSL Certificate

```bash
# Install Certbot
sudo yum install -y certbot

# Get certificate (replace with your domain)
sudo certbot certonly --standalone -d api.yourdomain.com

# Set up reverse proxy (nginx or caddy)
```

### Step 13: Set Up Monitoring

```bash
# View logs continuously
docker-compose logs -f

# Check resource usage
docker stats

# Monitor disk space
df -h
```

### Step 14: Set Up Backups

```bash
# Create backup script
cat > ~/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec mockinterview-postgres pg_dump -U system mockinterview > backup_$DATE.sql
# Upload to object storage or keep local
EOF

chmod +x ~/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/opc/backup.sh
```

---

## 🎯 Quick Reference

### Useful Commands

```bash
# View all containers
docker ps

# View logs
docker-compose logs -f backend
docker-compose logs -f postgres
docker-compose logs -f redis

# Restart services
docker-compose restart backend

# Stop all services
docker-compose down

# Start all services
docker-compose up -d

# Rebuild and restart
docker-compose up -d --build

# Check resource usage
docker stats

# Clean up unused images
docker system prune -a
```

### Important Files

```
.env.vault          # Vault configuration (don't commit)
.env                # Traditional env vars (don't commit)
docker-compose.vault.yaml   # Vault deployment
docker-compose.prod.yaml    # Traditional deployment
```

### Access Points

- **API:** `http://YOUR_PUBLIC_IP:8080`
- **Health Check:** `http://YOUR_PUBLIC_IP:8080/health`
- **SSH:** `ssh -i ~/path/to/key.key opc@YOUR_PUBLIC_IP`

---

## 🐛 Troubleshooting

### Issue: Can't connect to instance

```bash
# Check security list has port 22 open
# Verify key permissions
chmod 400 ~/path/to/key.key
```

### Issue: Port 8080 not accessible

```bash
# Check firewall
sudo firewall-cmd --list-all

# Add port if missing
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload

# Check security list in OCI Console
```

### Issue: Container keeps restarting

```bash
# Check logs for errors
docker-compose logs backend

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Vault authentication failed
```

### Issue: Out of memory

```bash
# Check memory usage
free -h
docker stats

# Reduce container memory limits in docker-compose.yaml
```

### Issue: Vault authentication failed

```bash
# Test instance principal
curl -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/

# Verify dynamic group includes your instance
# Check IAM policies are correct
```

---

## 📞 Support Resources

- **Oracle Cloud Support:** [cloud.oracle.com/support](https://cloud.oracle.com/support)
- **Documentation:** See `ORACLE_VAULT_SETUP.md`, `VAULT_QUICK_START.md`
- **OCI CLI Reference:** [docs.oracle.com/iaas/tools/oci-cli](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/)

---

## ✅ Deployment Checklist

- [ ] Oracle Cloud account created
- [ ] Compute instance provisioned
- [ ] Firewall configured (Security List + OS firewall)
- [ ] Vault created (if using)
- [ ] IAM policies configured (if using vault)
- [ ] Secrets created in vault (if using)
- [ ] Dependencies installed on instance
- [ ] Repository cloned
- [ ] Configuration files set up (.env or .env.vault)
- [ ] Application deployed
- [ ] Health check passing
- [ ] External access verified
- [ ] Backups configured
- [ ] Monitoring set up

---

**🎉 Congratulations! Your application is now deployed!**

Access your API at: `http://YOUR_PUBLIC_IP:8080`
