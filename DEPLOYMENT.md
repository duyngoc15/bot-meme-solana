# Deployment Guide

This guide covers different deployment scenarios for the Meme Coin Trading Bot.

## Table of Contents
- [Local Development](#local-development)
- [Production Server](#production-server)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Monitoring Setup](#monitoring-setup)

## Local Development

### Prerequisites
```bash
# Install Node.js (v18+)
# Download from https://nodejs.org/ or use nvm:
nvm install 18
nvm use 18

# Verify installation
node --version
npm --version
```

### Running Locally
```bash
# 1. Clone repository
git clone https://github.com/your-repo/ai-memecoin-trading-bot.git
cd ai-memecoin-trading-bot

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings (use DRY_RUN=true initially)

# 3. Install dependencies
npm install

# 4. Run in dev mode (auto-reload)
npm run dev
```

### Production Build
```bash
# Build TypeScript to JavaScript
npm run build

# Run compiled code
npm start
```

## Production Server

### Server Requirements
- **OS**: Ubuntu 20.04+ or similar Linux distribution
- **CPU**: 2+ cores
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 20GB SSD
- **Node.js**: 18+ LTS
- **Network**: Stable connection, low latency to RPC endpoints

### Setup Script
```bash
#!/bin/bash
# setup.sh - Production server setup

set -e

echo "Installing dependencies..."
sudo apt update
sudo apt install -y git curl

echo "Installing Node.js 18 LTS..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

echo "Creating app directory..."
sudo mkdir -p /opt/meme_bot
sudo chown $USER:$USER /opt/meme_bot
cd /opt/meme_bot

echo "Cloning repository..."
git clone https://github.com/your-repo/ai-memecoin-trading-bot.git .

echo "Installing dependencies..."
npm install

echo "Building application..."
npm run build

echo "Creating systemd service..."
sudo tee /etc/systemd/system/trading-bot.service > /dev/null <<EOF
[Unit]
Description=Meme Coin Trading Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/meme_bot
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/trading-bot/output.log
StandardError=append:/var/log/trading-bot/error.log

[Install]
WantedBy=multi-user.target
EOF

echo "Creating log directory..."
sudo mkdir -p /var/log/trading-bot
sudo chown $USER:$USER /var/log/trading-bot

echo "Setup complete!"
echo "Next steps:"
echo "1. Edit /opt/meme_bot/.env with your configuration"
echo "2. sudo systemctl enable trading-bot"
echo "3. sudo systemctl start trading-bot"
echo "4. sudo systemctl status trading-bot"
```

### Systemd Service Management
```bash
# Enable service
sudo systemctl enable trading-bot

# Start service
sudo systemctl start trading-bot

# Check status
sudo systemctl status trading-bot

# View logs
journalctl -u trading-bot -f

# Stop/Restart
sudo systemctl stop trading-bot
sudo systemctl restart trading-bot
```

## Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
COPY frontend/ ./frontend/

EXPOSE 8080
CMD ["node", "dist/main.js"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  trading-bot:
    build: .
    container_name: meme-trading-bot
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - .env
    volumes:
      - ./data:/app/data
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Docker Commands
```bash
docker-compose build
docker-compose up -d
docker-compose logs -f
docker-compose down
docker-compose restart
```

## Cloud Deployment

### AWS EC2 / GCP Compute Engine

1. Launch instance (t3.small or larger, Ubuntu 20.04)
2. SSH in and run setup script
3. Configure `.env` with secrets
4. Start the service

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: trading-bot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: trading-bot
  template:
    metadata:
      labels:
        app: trading-bot
    spec:
      containers:
      - name: trading-bot
        image: your-registry/trading-bot:latest
        ports:
        - containerPort: 8080
        envFrom:
        - secretRef:
            name: trading-bot-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
```

## Monitoring Setup

### Health Check
```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/status
curl http://localhost:8080/api/metrics
```

### SSL/TLS (Nginx Reverse Proxy)
```bash
sudo apt install nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/trading-bot <<EOF
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/trading-bot /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com
```

## Maintenance

### Updates
```bash
sudo systemctl stop trading-bot
cd /opt/meme_bot
git pull
npm install
npm run build
sudo systemctl start trading-bot
```

### Troubleshooting

**Service won't start:**
```bash
journalctl -u trading-bot -n 50
node --version  # Must be 18+
```

**RPC connection issues:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  $SOLANA_RPC_URL
```

---

**Need Help?** Open an issue on GitHub or consult the documentation.
