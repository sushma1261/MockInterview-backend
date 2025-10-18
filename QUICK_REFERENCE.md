# Quick Reference Card - User Profile System

## Quick Start

```bash
# Setup (first time only)
./setup-user-profile.sh

# Start services
docker-compose up -d

# Run migrations
npm run migrate

# Start development
npm run dev
```

## Common Commands

### Docker Operations
```bash
# Start all services
docker-compose up -d

# Start specific services
docker-compose up -d postgres redis

# View logs
docker-compose logs -f backend
docker-compose logs -f postgres
docker-compose logs -f redis

# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes data!)
docker-compose down -v

# Restart a service
docker-compose restart backend
```

### Database Operations
```bash
# Run migrations
npm run migrate

# Connect to PostgreSQL
docker exec -it postgres psql -U system -d mockinterview

# Useful SQL queries
psql> SELECT * FROM user_profiles;
psql> SELECT * FROM jobs WHERE user_id = 1;
psql> \dt           # List tables
psql> \d user_profiles  # Describe table
psql> \q            # Quit
```

### Redis Operations
```bash
# Connect to Redis
docker exec -it redis redis-cli

# Common Redis commands
redis> KEYS *                    # List all keys
redis> GET user:abc123          # Get a value
redis> DEL user:abc123          # Delete a key
redis> FLUSHALL                 # Clear all cache (⚠️)
redis> TTL user:abc123          # Check time-to-live
redis> INFO stats               # View statistics
redis> exit                     # Exit
```

## API Endpoints Quick Reference

### Base URL
```
http://localhost:8080/api/user
```

### Headers (required for all requests)
```
Authorization: Bearer <firebase-token>
Content-Type: application/json
```

### User Profile
```bash
GET    /profile           # Get current user
PUT    /profile           # Update profile
DELETE /profile           # Delete account
```

### Preferences
```bash
GET    /preferences       # Get preferences
PUT    /preferences       # Update preferences
```

### Jobs
```bash
POST   /jobs                    # Create job
GET    /jobs                    # List jobs
GET    /jobs?status=applied     # Filter by status
GET    /jobs/statistics         # Get stats
GET    /jobs/:id                # Get single job
PUT    /jobs/:id                # Update job
DELETE /jobs/:id                # Delete job
```

### Resumes
```bash
POST   /resumes                 # Create resume
GET    /resumes                 # List resumes
GET    /resumes/primary         # Get primary
GET    /resumes/:id             # Get single resume
PUT    /resumes/:id             # Update resume
PUT    /resumes/:id/set-primary # Set as primary
DELETE /resumes/:id             # Delete resume
```

## Common Tasks

### Create a Complete User Flow
```bash
TOKEN="your-firebase-token"

# 1. Get profile (auto-creates)
curl -X GET http://localhost:8080/api/user/profile \
  -H "Authorization: Bearer $TOKEN"

# 2. Update preferences
curl -X PUT http://localhost:8080/api/user/preferences \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"theme": "dark", "interview_difficulty": "medium"}'

# 3. Create a job
curl -X POST http://localhost:8080/api/user/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Software Engineer", "company": "TechCorp"}'

# 4. Create a resume
curl -X POST http://localhost:8080/api/user/resumes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "My Resume", "is_primary": true}'
```

### Check Cache Performance
```bash
# In Redis CLI
redis> INFO stats
redis> INFO keyspace

# Look for these metrics:
# - keyspace_hits / keyspace_misses (hit ratio)
# - used_memory
# - connected_clients
```

### Troubleshoot Connection Issues
```bash
# Check if services are running
docker-compose ps

# Check service health
docker-compose exec postgres pg_isready -U system
docker-compose exec redis redis-cli ping

# View recent logs
docker-compose logs --tail=100 backend

# Restart everything
docker-compose restart
```

## Environment Variables (.env)

### Required Variables
```env
# Authentication
AUTH_ENABLED=true
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-email
FIREBASE_PRIVATE_KEY="your-key"

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=system
POSTGRES_PASSWORD=password
POSTGRES_DB=mockinterview

# Redis
REDIS_URL=redis://localhost:6379
```

## Cache Keys Reference

### Pattern Structure
```
user:<firebase_uid>                    # User profile
user:id:<user_id>                      # User profile by ID
prefs:<user_id>                        # User preferences
job:<job_id>                           # Single job
user_jobs:<user_id>:<status>:...       # User's jobs list
user_jobs:stats:<user_id>              # Job statistics
resume:<resume_id>                     # Single resume
user_resumes:<user_id>:...             # User's resumes list
user_resumes:<user_id>:primary         # Primary resume
```

### Cache TTL
- User profiles: 3600s (1 hour)
- User preferences: 3600s (1 hour)
- Jobs: 1800s (30 minutes)
- Resumes: 3600s (1 hour)

## HTTP Status Codes

### Success
- `200 OK` - Successful GET, PUT, DELETE
- `201 Created` - Successful POST

### Client Errors
- `400 Bad Request` - Invalid data
- `401 Unauthorized` - Missing/invalid token
- `404 Not Found` - Resource doesn't exist

### Server Errors
- `500 Internal Server Error` - Server error

## Common Issues & Solutions

### Issue: "Cannot connect to PostgreSQL"
```bash
# Solution 1: Check if running
docker-compose ps

# Solution 2: Restart service
docker-compose restart postgres

# Solution 3: Check logs
docker-compose logs postgres
```

### Issue: "Redis connection failed"
```bash
# Solution 1: Check Redis status
docker-compose exec redis redis-cli ping

# Solution 2: Restart Redis
docker-compose restart redis

# Solution 3: Check Redis URL in .env
REDIS_URL=redis://localhost:6379
```

### Issue: "401 Unauthorized"
```bash
# Solution 1: Check AUTH_ENABLED in .env
AUTH_ENABLED=true

# Solution 2: Verify Firebase token is valid
# Token expires after 1 hour - get new one

# Solution 3: Check token format
Authorization: Bearer <token>  # Must start with "Bearer "
```

### Issue: "Migration failed"
```bash
# Solution 1: Check database connection
psql -h localhost -U system -d mockinterview

# Solution 2: Drop and recreate database
docker-compose exec postgres psql -U system -c "DROP DATABASE mockinterview;"
docker-compose exec postgres psql -U system -c "CREATE DATABASE mockinterview;"
npm run migrate

# Solution 3: Check migration file syntax
cat src/db/migrations/001_user_profiles.sql
```

### Issue: "Cache not working"
```bash
# Solution 1: Check Redis is running
docker-compose exec redis redis-cli ping

# Solution 2: Clear cache and restart
docker-compose exec redis redis-cli FLUSHALL
docker-compose restart backend

# Solution 3: Check logs for Redis errors
docker-compose logs backend | grep -i redis
```

## Performance Tips

### 1. Monitor Cache Hit Rate
```bash
# Target: >80% hit rate
redis-cli INFO stats | grep keyspace
```

### 2. Use Pagination
```bash
# Good: Paginated query
GET /api/user/jobs?limit=20&offset=0

# Bad: Loading all jobs
GET /api/user/jobs
```

### 3. Use Status Filters
```bash
# Good: Filtered query
GET /api/user/jobs?status=applied

# Bad: Filter client-side
GET /api/user/jobs (then filter in code)
```

### 4. Monitor Database Queries
```sql
-- In PostgreSQL, check slow queries
SELECT * FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

## Security Checklist

- ✅ AUTH_ENABLED=true in production
- ✅ Firebase credentials secured
- ✅ Database password is strong
- ✅ Redis not exposed to public internet
- ✅ HTTPS enabled in production
- ✅ Input validation on all endpoints
- ✅ Rate limiting configured
- ✅ CORS properly configured

## Useful SQL Queries

```sql
-- Count users
SELECT COUNT(*) FROM user_profiles;

-- Jobs by status
SELECT application_status, COUNT(*) 
FROM jobs 
GROUP BY application_status;

-- Users with most jobs
SELECT u.email, COUNT(j.id) as job_count
FROM user_profiles u
LEFT JOIN jobs j ON u.id = j.user_id
GROUP BY u.id
ORDER BY job_count DESC
LIMIT 10;

-- Recent resumes
SELECT u.email, r.title, r.created_at
FROM resumes r
JOIN user_profiles u ON r.user_id = u.id
ORDER BY r.created_at DESC
LIMIT 10;

-- Primary resumes
SELECT u.email, r.title
FROM resumes r
JOIN user_profiles u ON r.user_id = u.id
WHERE r.is_primary = true;
```

## Development Workflow

```bash
# 1. Start services
docker-compose up -d

# 2. Watch logs
docker-compose logs -f backend

# 3. Make code changes
# Files auto-reload with ts-node-dev

# 4. Test endpoints
curl -X GET http://localhost:8080/api/user/profile \
  -H "Authorization: Bearer $TOKEN"

# 5. Check database
docker exec -it postgres psql -U system -d mockinterview

# 6. Check cache
docker exec -it redis redis-cli

# 7. Stop services when done
docker-compose down
```

## Production Deployment

```bash
# 1. Update .env for production
NODE_ENV=production
DATABASE_URL=your-production-db-url
REDIS_URL=your-production-redis-url

# 2. Build application
npm run build

# 3. Run migrations on production DB
npm run migrate

# 4. Start production server
npm start

# 5. Monitor logs
pm2 logs  # if using PM2
```

## Support Resources

- 📖 Full Documentation: `USER_PROFILE_README.md`
- 🏗️ Architecture: `ARCHITECTURE_DIAGRAMS.md`
- 🧪 API Testing: `API_TESTING_EXAMPLES.md`
- 📝 Implementation: `IMPLEMENTATION_SUMMARY.md`
- 🐛 GitHub Issues: [Link to your repo]

## Emergency Commands

```bash
# Stop everything immediately
docker-compose down

# Clear all data and start fresh
docker-compose down -v
docker-compose up -d
npm run migrate

# Export database backup
docker exec -t postgres pg_dump -U system mockinterview > backup.sql

# Restore database backup
docker exec -i postgres psql -U system mockinterview < backup.sql

# View all Docker logs
docker-compose logs
```

---

**Need help?** Check the full documentation in `USER_PROFILE_README.md`
