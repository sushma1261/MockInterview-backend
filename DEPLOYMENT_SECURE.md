# Secure VM Deployment Guide

> **Stack**: PostgreSQL (pgvector) + Redis + Node.js Backend + Nginx + Next.js Frontend  
> **Target**: Oracle Free Tier — VM.Standard.E2.1.Micro — 1 vCPU / 1 GB RAM / x86_64 (AMD)

---

## Step 1 — Generate a Dedicated Deploy SSH Key (Local Mac)

Never use your personal SSH key for GitHub Actions. Create a separate deploy key **before** creating the VM:

```bash
# Generate deploy key (no passphrase — needed for automation)
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -C "github-actions-deploy" -N ""

# View the public key — paste this into Oracle during VM creation (Step 2)
cat ~/.ssh/deploy_key.pub

# View the private key — add this to GitHub Secrets as VM_SSH_KEY
cat ~/.ssh/deploy_key
```

To SSH into the VM yourself from your Mac:
```bash
ssh -i ~/.ssh/deploy_key ubuntu@<vm-public-ip>
```

---

## Step 2 — Create the VM on Oracle Cloud

1. Go to **Compute → Instances → Create Instance**
2. **Name**: `mockinterview-vm`
3. **Availability Domain**: Select **AD-2**
4. **Image**: `Ubuntu 22.04`
5. **Shape**: `VM.Standard.E2.1.Micro`
6. **Networking**:
   - Use existing VCN or create new
   - Subnet: Public subnet
   - Assign a public IP: **Yes (Reserved)** — reserved IPs don't change on restart
7. **SSH Keys**: Select **"Paste public keys"** → paste contents of `~/.ssh/deploy_key.pub`
8. **Boot Volume**: Set to **50 GB**
9. Click **Create** and wait for **Running** state

---

## Step 3 — Configure VCN Security List (Cloud Firewall)

In Oracle Console → Networking → Virtual Cloud Networks → Your VCN → Security Lists → Default Security List → **Ingress Rules**:

| Source CIDR | Protocol | Port | Purpose |
|---|---|---|---|
| `<your-home-ip>/32` | TCP | 22 | SSH — your IP only (`curl -4 ifconfig.me` to find yours) |
| `0.0.0.0/0` | TCP | 80 | HTTP |
| `0.0.0.0/0` | TCP | 443 | HTTPS |
| `0.0.0.0/0` | ICMP | 3,4 | Keep existing |
| `10.0.0.0/16` | ICMP | 3 | Keep existing |

> **Delete** the default `0.0.0.0/0` TCP port 22 rule — SSH should be your IP only.

---

## Step 4 — Initial VM Setup

```bash
ssh -i ~/.ssh/deploy_key ubuntu@<vm-public-ip>

# System updates
sudo apt update && sudo apt upgrade -y

# Add 2 GB swap — critical for 1 GB RAM
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Verify swap
free -h
```

---

## Step 5 — Harden SSH

```bash
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config

# On Ubuntu 24.04 the service is named 'ssh' not 'sshd'
sudo systemctl restart ssh

# Verify settings took effect
sudo sshd -T | grep -E "passwordauthentication|permitrootlogin"
# Expected:
# passwordauthentication no
# permitrootlogin no
```

---

## Step 6 — Open VM-Level Firewall (iptables)

Oracle's iptables blocks ports even after the VCN Security List allows them:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

# Persist rules across reboots
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

---

## Step 7 — Install fail2ban

Auto-bans IPs with repeated failed SSH attempts:

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban

# Verify
sudo fail2ban-client status
```

---

## Step 8 — Install Docker & Docker Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker

# Verify
docker --version
docker compose version
```

---

## Step 9 — Install Node.js + PM2 (for Frontend)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# Verify
node --version
pm2 --version
```

---

## Step 10 — Install and Configure Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

Create the config:
```bash
sudo nano /etc/nginx/sites-available/mockinterview
```

Paste:
```nginx
server {
    listen 80;
    server_name <vm-public-ip>;

    client_max_body_size 20M;

    # Frontend — Next.js via PM2 on port 3000
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API — Node.js via Docker on port 8080
    # IMPORTANT: no trailing slash on proxy_pass
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Required for SSE / streaming
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mockinterview /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 11 — Set Up Backend Directory

```bash
mkdir -p ~/backend

# Copy docker-compose.prod.yaml from your local Mac
# Run this on your Mac:
scp -i ~/.ssh/deploy_key docker-compose.prod.yaml ubuntu@<vm-public-ip>:~/backend/
```

The `.env` file is written automatically by GitHub Actions on every deploy — never create it manually.

---

## Step 12 — Add GitHub Actions Secrets

In GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret Name | Value |
|---|---|
| `VM_IP` | VM public IP |
| `VM_SSH_KEY` | Contents of `~/.ssh/deploy_key` (private key) |
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |
| `POSTGRES_PASSWORD` | Strong DB password |
| `GEMINI_API_KEY` | Gemini API key from aistudio.google.com |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email (from downloaded JSON) |
| `FIREBASE_PRIVATE_KEY` | Service account private key (from downloaded JSON) |

---

## Step 13 — First Deploy via GitHub Actions

Push to the `docker-deployment` branch:

```bash
git push origin docker-deployment
```

GitHub Actions will:
1. Build and push the Docker image to Docker Hub
2. SSH into the VM, write `.env` from secrets
3. Pull the new image and restart the backend container

---

## Step 14 — Run Database Migrations (First Time Only)

```bash
# From your local Mac — copy SQL files to VM
scp -i ~/.ssh/deploy_key src/db/migrations/*.sql ubuntu@<vm-public-ip>:/tmp/

# On the VM — run in order
docker exec -i mockinterview-postgres psql -U system -d mockinterview < /tmp/001_complete_schema.sql
docker exec -i mockinterview-postgres psql -U system -d mockinterview < /tmp/004_interview_sessions.sql
docker exec -i mockinterview-postgres psql -U system -d mockinterview < /tmp/005_hr_recruitment_system.sql
```

---

## Step 15 — Deploy Frontend

```bash
# On the VM
cd ~/mockinterview-ui
npm install
npm run build

pm2 start npm --name frontend -- start
pm2 save
pm2 startup   # run the printed command to enable auto-start on reboot
```

---

## Verify Security

```bash
# 1. SSH hardening active
sudo sshd -T | grep -E "passwordauthentication|permitrootlogin"

# 2. fail2ban running
sudo fail2ban-client status sshd

# 3. No suspicious processes
ps aux --sort=-%cpu | head -20

# 4. From your Mac — password login rejected
ssh -o PubkeyAuthentication=no ubuntu@<vm-ip>
# Expected: Permission denied (publickey)
```

---

## Troubleshooting

**API returns 404:**
```bash
# Ensure no trailing slash on proxy_pass
grep proxy_pass /etc/nginx/sites-enabled/mockinterview
# Must be: proxy_pass http://127.0.0.1:8080;
```

**Slow nginx / curl hangs:**
```bash
# Use 127.0.0.1 not localhost in proxy_pass (avoids IPv6 timeout)
sudo sed -i 's|proxy_pass http://localhost|proxy_pass http://127.0.0.1|g' /etc/nginx/sites-enabled/mockinterview
sudo systemctl reload nginx
```

**DB table does not exist:**
```bash
# Migrations haven't run — see Step 14
docker logs mockinterview-backend --tail 20
```

**Backend not starting:**
```bash
docker logs mockinterview-backend --tail 50
docker compose -f ~/backend/docker-compose.prod.yaml ps
```

---

## Security Checklist

- [ ] SSH port 22 restricted to your home IP in VCN Security List
- [ ] `PasswordAuthentication no` in sshd_config
- [ ] `PermitRootLogin no` in sshd_config
- [ ] fail2ban installed and running
- [ ] Dedicated deploy key used (not personal SSH key) for GitHub Actions
- [ ] `.env` never committed to git — written by CI/CD only
- [ ] All secrets in GitHub Actions Secrets only
- [ ] Boot volume deleted when terminating a compromised VM
- [ ] `proxy_pass` uses `127.0.0.1` not `localhost` in nginx
