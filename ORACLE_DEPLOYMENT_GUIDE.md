# Oracle Cloud Free Tier Deployment Guide

This guide will help you deploy the MockInterview Backend application to Oracle Cloud Infrastructure (OCI) Free Tier.

## Table of Contents
1. [Oracle Free Tier Resources Overview](#oracle-free-tier-resources-overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Create Oracle Cloud Account](#step-1-create-oracle-cloud-account)
4. [Step 2: Set Up Compute Instance](#step-2-set-up-compute-instance)
5. [Step 3: Configure Networking](#step-3-configure-networking)
6. [Step 4: Install Required Software](#step-4-install-required-software)
7. [Step 5: Deploy Application](#step-5-deploy-application)
8. [Step 6: Set Up Database (Optional)](#step-6-set-up-database-optional)
9. [Step 7: Configure SSL/HTTPS](#step-7-configure-sslhttps)
10. [Monitoring and Maintenance](#monitoring-and-maintenance)

---

## Oracle Free Tier Resources Overview

Your free tier includes:
- **Compute**: 
  - 2x AMD VM instances (VM.Standard.E2.1.Micro) OR
  - Up to 4 ARM instances (VM.Standard.A1.Flex) with 4 OCPUs and 24GB RAM total
- **Storage**: 200 GB Block Volume (for boot + data volumes)
- **Database**: 2 Always Free Autonomous Databases (20GB each)
- **Networking**: 
  - 2 VCNs
  - 1 Load Balancer (10 Mbps)
  - 10 TB outbound data transfer/month
- **Object Storage**: 20 GB
- **Other**: Redis compatible with OCI Cache, Email delivery (3000/month)

---

## Prerequisites

✅ Oracle Cloud account (sign up at https://www.oracle.com/cloud/free/)
✅ Domain name (optional, for custom domain)
✅ Firebase credentials file
✅ Google AI API key
✅ Basic understanding of Linux and Docker

---

## Step 1: Create Oracle Cloud Account

1. Go to https://www.oracle.com/cloud/free/
2. Click "Start for free"
3. Fill in your details (email, country, etc.)
4. Verify your email and phone number
5. Add payment method (won't be charged for Always Free resources)
6. Choose your home region (IMPORTANT: this cannot be changed later)

**Recommended Regions** (for low latency):
- US West (Phoenix) - `us-phoenix-1`
- US East (Ashburn) - `us-ashburn-1`
- UK South (London) - `uk-london-1`
- Asia Pacific (Mumbai) - `ap-mumbai-1`

---

## Step 2: Set Up Compute Instance

### Option A: ARM Instance (Recommended - Better Performance)

1. **Navigate to Compute Instances**
   - Open hamburger menu → Compute → Instances
   - Click "Create Instance"

2. **Configure Instance**
   - **Name**: `mockinterview-backend`
   - **Compartment**: Select your compartment (usually root)
   - **Placement**: Choose an Availability Domain
   - **Image**: Oracle Linux 8 or Ubuntu 22.04 (recommended)
   - **Shape**: Click "Change Shape"
     - Select "Ampere" 
     - Choose `VM.Standard.A1.Flex`
     - Set OCPU: 2 (or 4 for better performance)
     - Memory: 12 GB (or 24 GB)

3. **Networking**
   - Create new VCN: `mockinterview-vcn`
   - Create new public subnet: `public-subnet`
   - **Assign public IPv4 address**: YES ✅

4. **SSH Keys**
   - Generate SSH key pair (save private key securely)
   - Or upload your own public key

5. **Boot Volume**
   - Size: 50-100 GB (from your 200 GB quota)

6. Click **Create**

### Option B: AMD Micro Instance (Alternative)

Follow same steps but:
- **Shape**: `VM.Standard.E2.1.Micro`
- **OCPU**: 1 (fixed)
- **Memory**: 1 GB (fixed)

**Note**: AMD Micro has limited resources. Consider using external database services.

---

## Step 3: Configure Networking

### 3.1 Configure Security List (Firewall Rules)

1. Go to **Networking → Virtual Cloud Networks**
2. Click on your VCN → Security Lists → Default Security List
3. Add **Ingress Rules**:

```
Rule 1 - SSH
- Stateless: No
- Source CIDR: 0.0.0.0/0
- IP Protocol: TCP
- Source Port Range: All
- Destination Port Range: 22

Rule 2 - HTTP
- Stateless: No
- Source CIDR: 0.0.0.0/0
- IP Protocol: TCP
- Source Port Range: All
- Destination Port Range: 80

Rule 3 - HTTPS
- Stateless: No
- Source CIDR: 0.0.0.0/0
- IP Protocol: TCP
- Source Port Range: All
- Destination Port Range: 443

Rule 4 - Application Port
- Stateless: No
- Source CIDR: 0.0.0.0/0
- IP Protocol: TCP
- Source Port Range: All
- Destination Port Range: 8080
```

### 3.2 Configure OS Firewall

After connecting to instance (see Step 4), run:

```bash
# For Oracle Linux
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload

# For Ubuntu
sudo ufw allow 8080/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

---

## Step 4: Install Required Software

### 4.1 Connect to Instance

```bash
# Replace with your instance's public IP and path to private key
ssh -i /path/to/private-key opc@<PUBLIC_IP>
# For Ubuntu, use: ssh -i /path/to/private-key ubuntu@<PUBLIC_IP>
```

### 4.2 Update System

```bash
sudo yum update -y  # For Oracle Linux
# OR
sudo apt update && sudo apt upgrade -y  # For Ubuntu
```

### 4.3 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Enable Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Log out and back in for group changes to take effect
exit
# Then reconnect via SSH
```

### 4.4 Install Docker Compose

```bash
# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### 4.5 Install Node.js (Optional - for non-Docker deployment)

```bash
# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs  # For Oracle Linux
# OR
sudo apt install -y nodejs  # For Ubuntu

# Verify
node --version
npm --version
```

---

## Step 5: Deploy Application

### 5.1 Clone Repository

```bash
# Install git if not present
sudo yum install git -y  # Oracle Linux
# OR
sudo apt install git -y  # Ubuntu

# Clone your repository
git clone https://github.com/sushma1261/MockInterview-backend.git
cd MockInterview-backend
```

### 5.2 Create Environment File

```bash
# Create .env file
nano .env
```

Add the following (replace with your actual values):

```env
# Server Configuration
NODE_ENV=production
PORT=8080
BASE_URL=http://your-public-ip

# Database Configuration (for Docker Compose)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=system
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=mockinterview

# OR for external database (Autonomous Database)
# DATABASE_URL=postgresql://user:password@host:port/database

# Redis Configuration
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Google AI Configuration
GOOGLE_API_KEY=your-google-ai-api-key

# Session Configuration
SESSION_SECRET=your-very-secure-random-session-secret

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### 5.3 Upload Firebase Credentials

```bash
# Create firebase directory
mkdir -p firebase

# Upload your Firebase service account JSON file
# You can use scp from your local machine:
# scp -i /path/to/private-key /path/to/firebase-credentials.json opc@<PUBLIC_IP>:~/MockInterview-backend/firebase/
```

### 5.4 Create Production Docker Compose File

```bash
nano docker-compose.prod.yaml
```

See the `docker-compose.prod.yaml` file in this repository for the configuration.

### 5.5 Update Dockerfile for Production

```bash
nano Dockerfile.prod
```

See the `Dockerfile.prod` file in this repository for the configuration.

### 5.6 Deploy with Docker Compose

```bash
# Build and start services
docker-compose -f docker-compose.prod.yaml up -d --build

# Check status
docker-compose -f docker-compose.prod.yaml ps

# View logs
docker-compose -f docker-compose.prod.yaml logs -f backend

# Run migrations
docker-compose -f docker-compose.prod.yaml exec backend npm run migrate
```

### 5.7 Set Up Auto-Restart on Boot

```bash
# Create systemd service
sudo nano /etc/systemd/system/mockinterview.service
```

Add:

```ini
[Unit]
Description=MockInterview Backend
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/opc/MockInterview-backend
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yaml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yaml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable service:

```bash
sudo systemctl enable mockinterview
sudo systemctl start mockinterview
```

---

## Step 6: Set Up Database (Optional)

### Option A: Use Docker PostgreSQL (Included in docker-compose)

This is already configured in `docker-compose.prod.yaml`. Your PostgreSQL data will be persisted in Docker volumes.

**Backup Database:**

```bash
# Create backup
docker-compose -f docker-compose.prod.yaml exec postgres pg_dump -U system mockinterview > backup.sql

# Restore backup
cat backup.sql | docker-compose -f docker-compose.prod.yaml exec -T postgres psql -U system mockinterview
```

### Option B: Use Oracle Autonomous Database (Always Free)

1. **Create Autonomous Database**
   - Go to hamburger menu → Oracle Database → Autonomous Database
   - Click "Create Autonomous Database"
   - **Display name**: `mockinterview-db`
   - **Database name**: `MOCKINTDB`
   - **Workload type**: Transaction Processing
   - **Deployment type**: Shared Infrastructure
   - **Always Free**: Toggle ON ✅
   - **Password**: Create secure admin password
   - Click "Create Autonomous Database"

2. **Download Wallet**
   - Click on your database → DB Connection
   - Download Wallet (save password)
   - Upload wallet to instance:
     ```bash
     scp -i /path/to/key Wallet_MOCKINTDB.zip opc@<PUBLIC_IP>:~/
     ```

3. **Configure Connection**
   - Unzip wallet:
     ```bash
     mkdir -p ~/wallet
     unzip Wallet_MOCKINTDB.zip -d ~/wallet
     ```
   - Update `.env`:
     ```env
     POSTGRES_HOST=your-db-host.oraclecloud.com
     POSTGRES_PORT=1522
     POSTGRES_USER=admin
     POSTGRES_PASSWORD=your-admin-password
     POSTGRES_DB=MOCKINTDB
     TNS_ADMIN=/home/opc/wallet
     ```

4. **Update docker-compose** to mount wallet:
   ```yaml
   volumes:
     - ./wallet:/app/wallet:ro
   environment:
     TNS_ADMIN: /app/wallet
   ```

---

## Step 7: Configure SSL/HTTPS

### Option A: Using Nginx Reverse Proxy with Let's Encrypt

1. **Install Nginx**

```bash
sudo yum install nginx -y  # Oracle Linux
# OR
sudo apt install nginx -y  # Ubuntu

sudo systemctl enable nginx
sudo systemctl start nginx
```

2. **Configure Nginx**

```bash
sudo nano /etc/nginx/conf.d/mockinterview.conf
```

Add:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
}
```

3. **Install Certbot for SSL**

```bash
# Install certbot
sudo yum install certbot python3-certbot-nginx -y  # Oracle Linux
# OR
sudo apt install certbot python3-certbot-nginx -y  # Ubuntu

# Obtain certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal is set up automatically
# Test renewal:
sudo certbot renew --dry-run
```

### Option B: Using Caddy (Easier, Auto SSL)

```bash
# Install Caddy
sudo yum install yum-plugin-copr -y
sudo yum copr enable @caddy/caddy -y
sudo yum install caddy -y

# Create Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Add:

```
your-domain.com {
    reverse_proxy localhost:8080
}
```

```bash
# Start Caddy
sudo systemctl enable caddy
sudo systemctl start caddy
```

---

## Monitoring and Maintenance

### Check Application Status

```bash
# Check docker containers
docker-compose -f docker-compose.prod.yaml ps

# View logs
docker-compose -f docker-compose.prod.yaml logs -f

# Check resource usage
docker stats

# System resources
htop
df -h
```

### Update Application

```bash
cd ~/MockInterview-backend
git pull origin main
docker-compose -f docker-compose.prod.yaml up -d --build
```

### Backup Strategy

```bash
# Create backup script
nano ~/backup.sh
```

Add:

```bash
#!/bin/bash
BACKUP_DIR="/home/opc/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
docker-compose -f /home/opc/MockInterview-backend/docker-compose.prod.yaml exec -T postgres \
  pg_dump -U system mockinterview | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# Backup environment and configs
cp /home/opc/MockInterview-backend/.env $BACKUP_DIR/env_backup_$DATE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
chmod +x ~/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
```

Add:

```
0 2 * * * /home/opc/backup.sh >> /home/opc/backup.log 2>&1
```

### Monitoring with Oracle Cloud

1. **Enable Compute Metrics**
   - Hamburger menu → Observability & Management → Monitoring
   - View CPU, Memory, Network metrics

2. **Set Up Alarms**
   - Create alarms for high CPU/memory usage
   - Configure email notifications

### Security Best Practices

```bash
# 1. Regular updates
sudo yum update -y  # Run weekly

# 2. Configure fail2ban (prevent brute force)
sudo yum install epel-release -y
sudo yum install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 3. Disable root SSH login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
sudo systemctl restart sshd

# 4. Use SSH keys only (disable password auth)
# In /etc/ssh/sshd_config
# Set: PasswordAuthentication no
```

---

## Troubleshooting

### Issue: Cannot create instance - "Out of capacity"

**Solution**: Try different availability domains or wait and retry. Upgrade to paid account for better availability.

### Issue: Cannot connect to instance

**Solutions**:
1. Check security list has port 22 open
2. Check OS firewall: `sudo firewall-cmd --list-all`
3. Verify SSH key is correct
4. Check instance is running

### Issue: Application not accessible

**Solutions**:
1. Check security list has port 8080/80/443 open
2. Check application is running: `docker-compose ps`
3. Check logs: `docker-compose logs backend`
4. Verify firewall: `sudo firewall-cmd --list-all`

### Issue: High CPU usage (instance may be reclaimed)

**Important**: Oracle reclaims idle instances. To prevent:
- Keep CPU usage > 20%
- Keep network usage > 20%
- Keep memory usage > 20% (ARM instances)

Set up a keep-alive script:

```bash
# Create keep-alive script
nano ~/keep-alive.sh
```

```bash
#!/bin/bash
# Generate some CPU activity
dd if=/dev/zero of=/dev/null &
STRESS_PID=$!
sleep 30
kill $STRESS_PID
```

```bash
chmod +x ~/keep-alive.sh

# Add to crontab (every hour)
crontab -e
# Add: 0 * * * * /home/opc/keep-alive.sh
```

### Issue: Database connection errors

**Solutions**:
1. Check database container is running
2. Verify credentials in `.env`
3. Check database logs: `docker-compose logs postgres`
4. Test connection: 
   ```bash
   docker-compose exec postgres psql -U system -d mockinterview
   ```

---

## Cost Management

While using Always Free resources:
- ✅ 2 AMD Micro instances = FREE
- ✅ 4 ARM instances (total 4 OCPU, 24GB) = FREE
- ✅ 200 GB storage = FREE
- ✅ 10 TB outbound data transfer/month = FREE
- ✅ Autonomous Database (2x 20GB) = FREE

**To avoid charges:**
- Stay within Always Free limits
- Monitor usage in Oracle Cloud Console
- Set up billing alerts
- Use `cost-tracking` tags on resources

---

## Next Steps

1. ✅ Set up domain name and configure DNS
2. ✅ Configure SSL/HTTPS
3. ✅ Set up monitoring and alerts
4. ✅ Implement automated backups
5. ✅ Configure CI/CD pipeline
6. ✅ Set up load balancer (if scaling)
7. ✅ Configure email service (3000 free emails/month)

---

## Additional Resources

- [Oracle Cloud Free Tier FAQ](https://www.oracle.com/cloud/free/faq.html)
- [Oracle Cloud Documentation](https://docs.oracle.com/iaas/)
- [Oracle Cloud Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI CLI Setup](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm)

---

## Support

For issues specific to:
- **Oracle Cloud**: Oracle Cloud Support or Community Forums
- **Application**: Create issue in GitHub repository
- **Deployment**: Check troubleshooting section above

---

**Last Updated**: October 2025
**Tested On**: Oracle Linux 8, Ubuntu 22.04
**Docker Version**: 24.x
**Docker Compose Version**: 2.x
