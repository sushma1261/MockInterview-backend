#!/bin/bash

# Quick Setup Script for User Profile System

echo "🚀 Setting up User Profile System..."

# 1. Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update .env with your Firebase and database credentials"
    exit 1
fi

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install ioredis @types/ioredis --legacy-peer-deps

# 3. Start Docker services
echo "🐳 Starting Docker services (PostgreSQL + Redis)..."
docker-compose up -d postgres redis

# 4. Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# 5. Run migrations
echo "🔄 Running database migrations..."
npm run migrate

# 6. Done
echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo "   1. Update your .env file with Firebase credentials"
echo "   2. Run 'npm run dev' to start the development server"
echo "   3. Check USER_PROFILE_README.md for API documentation"
echo ""
echo "🎉 Happy coding!"
