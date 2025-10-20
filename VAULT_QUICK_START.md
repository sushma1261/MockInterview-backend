# Quick Start: Oracle Cloud Deployment with Vault

This guide provides a streamlined process to deploy your MockInterview backend to Oracle Cloud Free Tier with Vault secret management.

## Prerequisites

- Oracle Cloud account (Free Tier)
- OCI compute instance running (see `ORACLE_DEPLOYMENT_GUIDE.md`)
- Domain/public IP for your instance

## 🚀 Quick Deployment Steps

### 1. Set Up Oracle Vault (One-Time Setup)

#### A. Create Vault and Master Key

```bash
# Via OCI Console (Easiest):
# 1. Navigate to: Identity & Security > Vault
# 2. Click "Create Vault"
#    - Name: mockinterview-vault
#    - Make Virtual Private Vault: No (unchecked for free tier)
# 3. Open your vault > Master Encryption Keys > Create Key
#    - Name: mockinterview-master-key
#    - Protection Mode: HSM
#    - Algorithm: AES (256-bit)
```

#### B. Configure IAM Policies

```bash
# 1. Create Dynamic Group
# Navigation: Identity & Security > Dynamic Groups > Create Dynamic Group
# Name: mockinterview-instances
# Rule:
ANY {instance.compartment.id = 'your-compartment-ocid'}

# 2. Create Policy
# Navigation: Identity & Security > Policies > Create Policy
# Name: mockinterview-vault-policy
# Compartment: Root or your compartment
# Statements:
Allow dynamic-group mockinterview-instances to read secret-family in compartment <your-compartment-name>
Allow dynamic-group mockinterview-instances to read vaults in compartment <your-compartment-name>
Allow dynamic-group mockinterview-instances to read keys in compartment <your-compartment-name>
```

### 2. Deploy on Compute Instance

#### A. Connect to Your Instance

```bash
ssh -i ~/.ssh/your-key.pem opc@<your-instance-ip>
```

#### B. Install Dependencies (if not already done)

```bash
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

# Logout and login again for group membership
exit
# SSH back in
```

#### C. Clone Your Repository

```bash
git clone https://github.com/sushma1261/MockInterview-backend.git
cd MockInterview-backend
```

#### D. Create Vault Configuration

```bash
# Copy the example file
cp .env.vault.example .env.vault

# Edit with your values
nano .env.vault
```

**Fill in these critical values:**

```bash
# Get from OCI Console
OCI_REGION=us-ashburn-1  # Your region
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..aaaaaaaa...  # Your compartment
OCI_VAULT_ID=ocid1.vault.oc1..aaaaaaaa...  # Your vault
OCI_KEY_ID=ocid1.key.oc1..aaaaaaaa...  # Your master key

# Enable vault on compute instance
OCI_USE_INSTANCE_PRINCIPAL=true
USE_ORACLE_VAULT=true
```

#### E. Create Secrets in Vault

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Run the secret creation script
./scripts/create-vault-secrets.sh
```

The script will prompt you for:
- PostgreSQL password
- Google AI API key
- Firebase project ID
- Firebase client email
- Firebase private key

After completion, it creates `.env.vault.generated` with secret OCIDs.

#### F. Update .env.vault with Secret OCIDs

```bash
# Copy OCIDs from generated file to .env.vault
cat .env.vault.generated

# Edit .env.vault and paste the OCIDs
nano .env.vault
```

#### G. Deploy!

```bash
# Run the deployment script
./scripts/deploy-with-vault.sh
```

The script will:
1. ✅ Check prerequisites
2. ✅ Verify instance principal authentication
3. ✅ Test Vault connectivity
4. ✅ Generate environment configuration
5. ✅ Build Docker images
6. ✅ Start all services
7. ✅ Run health checks

### 3. Configure Firewall

```bash
# Allow HTTP traffic
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload

# Update OCI Security List (via Console):
# 1. Navigate to: Networking > Virtual Cloud Networks
# 2. Select your VCN > Security Lists > Default Security List
# 3. Add Ingress Rule:
#    - Source CIDR: 0.0.0.0/0
#    - Destination Port: 8080
#    - Protocol: TCP
```

### 4. Verify Deployment

```bash
# Check service status
docker-compose -f docker-compose.vault.yaml ps

# View logs
docker-compose -f docker-compose.vault.yaml logs -f backend

# Test health endpoint
curl http://localhost:8080/health

# Test from outside
curl http://<your-public-ip>:8080/health
```

## 📋 Common Tasks

### View Secrets

```bash
# List all secrets
oci vault secret list \
  --compartment-id $OCI_COMPARTMENT_ID \
  --vault-id $OCI_VAULT_ID

# Get secret value (for testing)
oci secrets secret-bundle get \
  --secret-id <secret-ocid> \
  --query 'data."secret-bundle-content".content' \
  --raw-output | base64 -d
```

### Rotate a Secret

```bash
# Method 1: Use the creation script again
./scripts/create-vault-secrets.sh
# Select the secret to update

# Method 2: Use OCI CLI
echo -n "new-password" | base64
oci vault secret update-base64 \
  --secret-id <secret-ocid> \
  --secret-content-content <base64-encoded-value>

# Restart application to pick up new secret
docker-compose -f docker-compose.vault.yaml restart backend
```

### Update Application

```bash
# Pull latest code
git pull

# Rebuild and restart
./scripts/deploy-with-vault.sh
```

### View Application Logs

```bash
# All services
docker-compose -f docker-compose.vault.yaml logs -f

# Just backend
docker-compose -f docker-compose.vault.yaml logs -f backend

# Just postgres
docker-compose -f docker-compose.vault.yaml logs -f postgres

# Last 100 lines
docker-compose -f docker-compose.vault.yaml logs --tail=100
```

### Restart Services

```bash
# Restart all
docker-compose -f docker-compose.vault.yaml restart

# Restart specific service
docker-compose -f docker-compose.vault.yaml restart backend

# Stop all
docker-compose -f docker-compose.vault.yaml down

# Start all
docker-compose -f docker-compose.vault.yaml up -d
```

### Monitor Resources

```bash
# Container resource usage
docker stats

# Disk usage
df -h

# Service health
docker-compose -f docker-compose.vault.yaml ps
```

## 🐛 Troubleshooting

### Issue: "Failed to connect to Oracle Vault"

**Solution:**
```bash
# 1. Verify instance principal
curl -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/

# 2. Check dynamic group membership
# Verify in OCI Console that your instance is in the dynamic group

# 3. Verify IAM policies
# Check that policies allow reading secrets
```

### Issue: "Authentication failed"

**Solution:**
```bash
# Test OCI CLI
oci iam region list

# If fails, reconfigure
oci setup config
```

### Issue: "Container keeps restarting"

**Solution:**
```bash
# Check logs for errors
docker-compose -f docker-compose.vault.yaml logs backend

# Common issues:
# - Secret not found: Verify SECRET_*_OCID values
# - Database connection: Check POSTGRES_PASSWORD loaded
# - Permissions: Verify IAM policies
```

### Issue: "Out of memory"

**Solution:**
```bash
# Check memory usage
free -h

# Adjust resource limits in docker-compose.vault.yaml
# For 1GB instance, reduce limits:
deploy:
  resources:
    limits:
      memory: 800M
```

## 🔒 Security Best Practices

1. **Never commit secrets**
   - Add `.env.vault` to `.gitignore`
   - Never log secret values

2. **Rotate secrets regularly**
   - Use the rotation script quarterly
   - Update secrets in vault, not in config files

3. **Monitor access**
   - Review audit logs in OCI Console
   - Set up alarms for unusual access patterns

4. **Use HTTPS in production**
   - Set up nginx/caddy reverse proxy
   - Get SSL certificate from Let's Encrypt

5. **Backup strategy**
   - Regular database backups
   - Document secret recovery procedures

## 📊 Cost Monitoring

### Always Free Resources Used

- ✅ Compute: 1x ARM instance (4 OCPUs, 24 GB RAM)
- ✅ Block Storage: 200 GB (for Docker volumes)
- ✅ Vault: 20 HSM key versions + 150 secrets
- ✅ Outbound Transfer: 10 TB/month

### Stay Within Free Tier

- Use `docker system prune` regularly
- Monitor with: `df -h` and `docker system df`
- Set up billing alerts in OCI Console

## 🎯 Next Steps

1. ✅ Set up SSL/TLS with reverse proxy
2. ✅ Configure custom domain
3. ✅ Set up monitoring and alerting
4. ✅ Implement automated backups
5. ✅ Set up CI/CD pipeline
6. ✅ Configure log aggregation

## 📚 Additional Resources

- [Oracle Vault Documentation](https://docs.oracle.com/en-us/iaas/Content/KeyManagement/home.htm)
- [OCI CLI Reference](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Instance Principal Auth](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/callingservicesfrominstances.htm)

## 🆘 Need Help?

- Check logs: `docker-compose -f docker-compose.vault.yaml logs -f`
- Review `ORACLE_VAULT_SETUP.md` for detailed Vault setup
- Review `ORACLE_DEPLOYMENT_GUIDE.md` for infrastructure setup
- Oracle Cloud Support: [https://cloud.oracle.com/support](https://cloud.oracle.com/support)

---

**Happy deploying! 🚀**
