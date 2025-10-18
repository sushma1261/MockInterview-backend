# User Profile System Documentation

## Overview

This system implements a complete user profile management solution with:
- **Firebase Authentication**: Handles user authentication and provides Firebase UIDs
- **PostgreSQL**: Stores user profiles, preferences, jobs, and resumes
- **Redis**: Provides caching layer for improved performance

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ (JWT Token)
       ▼
┌─────────────────────────────────────┐
│    Express Middleware (Auth)        │
│  - Verify Firebase Token            │
│  - Get/Create User Profile in DB    │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│        Service Layer                │
│  ┌────────────────────────────┐    │
│  │ Check Redis Cache          │    │
│  │   ├─ Hit  → Return Data    │    │
│  │   └─ Miss → Query PostgreSQL│   │
│  │            → Cache Result   │    │
│  └────────────────────────────┘    │
└─────────────────────────────────────┘
```

## Database Schema

### Tables

#### `user_profiles`
Stores basic user information from Firebase.
- `id`: Primary key
- `firebase_uid`: Unique Firebase user ID
- `email`: User's email
- `display_name`: Display name
- `photo_url`: Profile photo URL

#### `user_preferences`
Stores user preferences for the interview experience.
- `interview_difficulty`: easy | medium | hard
- `interview_duration`: Duration in minutes
- `preferred_languages`: Array of programming languages
- `notification_enabled`: Boolean
- `theme`: light | dark

#### `jobs`
Stores job applications the user is tracking.
- `title`: Job title
- `company`: Company name
- `description`: Job description
- `application_status`: interested | applied | interviewing | offered | rejected
- And more fields...

#### `resumes`
Stores user's resumes.
- `title`: Resume title
- `file_path`: Path to uploaded file
- `content`: Extracted text content
- `is_primary`: Boolean flag for primary resume

## API Endpoints

### User Profile

#### Get Current User Profile
```
GET /api/user/profile
Authorization: Bearer <firebase-token>

Response:
{
  "id": 1,
  "firebase_uid": "abc123...",
  "email": "user@example.com",
  "display_name": "John Doe",
  "photo_url": "https://...",
  "created_at": "2025-10-16T...",
  "updated_at": "2025-10-16T..."
}
```

#### Update User Profile
```
PUT /api/user/profile
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "display_name": "New Name",
  "photo_url": "https://..."
}
```

#### Delete User Profile
```
DELETE /api/user/profile
Authorization: Bearer <firebase-token>
```

### User Preferences

#### Get Preferences
```
GET /api/user/preferences
Authorization: Bearer <firebase-token>
```

#### Update Preferences
```
PUT /api/user/preferences
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "interview_difficulty": "hard",
  "interview_duration": 45,
  "preferred_languages": ["JavaScript", "Python"],
  "theme": "dark"
}
```

### Jobs

#### Create Job
```
POST /api/user/jobs
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "title": "Senior Software Engineer",
  "company": "Tech Corp",
  "description": "Job description...",
  "application_status": "interested",
  "location": "San Francisco, CA"
}
```

#### Get All User Jobs
```
GET /api/user/jobs?status=applied&limit=20&offset=0
Authorization: Bearer <firebase-token>

Query Parameters:
- status (optional): Filter by application status
- limit (optional, default 50): Number of results
- offset (optional, default 0): Pagination offset
```

#### Get Job Statistics
```
GET /api/user/jobs/statistics
Authorization: Bearer <firebase-token>

Response:
{
  "total": 25,
  "by_status": {
    "interested": 5,
    "applied": 10,
    "interviewing": 7,
    "offered": 2,
    "rejected": 1
  }
}
```

#### Get Single Job
```
GET /api/user/jobs/:id
Authorization: Bearer <firebase-token>
```

#### Update Job
```
PUT /api/user/jobs/:id
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "application_status": "interviewing",
  "notes": "First round interview scheduled"
}
```

#### Delete Job
```
DELETE /api/user/jobs/:id
Authorization: Bearer <firebase-token>
```

### Resumes

#### Create Resume
```
POST /api/user/resumes
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "title": "Software Engineer Resume",
  "file_path": "/uploads/resume.pdf",
  "content": "Extracted text...",
  "is_primary": true
}
```

#### Get All User Resumes
```
GET /api/user/resumes?limit=20&offset=0
Authorization: Bearer <firebase-token>
```

#### Get Primary Resume
```
GET /api/user/resumes/primary
Authorization: Bearer <firebase-token>
```

#### Get Single Resume
```
GET /api/user/resumes/:id
Authorization: Bearer <firebase-token>
```

#### Update Resume
```
PUT /api/user/resumes/:id
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "title": "Updated Resume Title",
  "is_primary": false
}
```

#### Set Primary Resume
```
PUT /api/user/resumes/:id/set-primary
Authorization: Bearer <firebase-token>
```

#### Delete Resume
```
DELETE /api/user/resumes/:id
Authorization: Bearer <firebase-token>
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Required variables:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `POSTGRES_*` variables
- `REDIS_URL`

### 3. Start Services with Docker
```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)

### 4. Run Database Migrations
```bash
npm run migrate
```

### 5. Start Development Server
```bash
npm run dev
```

## Caching Strategy

### Cache Keys
- User profiles: `user:<firebase_uid>` or `user:id:<user_id>`
- User preferences: `prefs:<user_id>`
- Jobs: `job:<job_id>`
- User's jobs list: `user_jobs:<user_id>:<status>:<limit>:<offset>`
- Resumes: `resume:<resume_id>`
- User's resumes list: `user_resumes:<user_id>:<limit>:<offset>`

### Cache TTL (Time To Live)
- User profiles: 1 hour (3600 seconds)
- User preferences: 1 hour (3600 seconds)
- Jobs: 30 minutes (1800 seconds)
- Resumes: 1 hour (3600 seconds)

### Cache Invalidation
- Automatic invalidation on updates/deletes
- Related caches invalidated when needed (e.g., updating a job invalidates user's jobs list)

## Service Layer

### UserProfileService
Handles user profiles and preferences with Redis caching.

Methods:
- `getOrCreateUserProfile()`: Get existing or create new profile
- `getUserProfileByFirebaseUid()`: Get by Firebase UID (cached)
- `updateUserProfile()`: Update and invalidate cache
- `getUserPreferences()`: Get preferences (cached)
- `updateUserPreferences()`: Update and invalidate cache

### JobService
Manages job applications with caching.

Methods:
- `createJob()`: Create new job
- `getUserJobs()`: Get all jobs for user (cached by query params)
- `getJobById()`: Get single job (cached)
- `updateJob()`: Update and invalidate caches
- `deleteJob()`: Delete and invalidate caches
- `getJobStatistics()`: Get aggregated stats (cached)

### ResumeService
Manages resumes with caching.

Methods:
- `createResume()`: Create new resume
- `getUserResumes()`: Get all resumes (cached)
- `getPrimaryResume()`: Get primary resume (cached)
- `updateResume()`: Update and invalidate caches
- `setPrimaryResume()`: Set as primary, unset others

## Authentication Flow

1. Client sends request with Firebase JWT token in Authorization header
2. `authenticate` middleware:
   - Verifies Firebase token
   - Extracts user info (uid, email, name, picture)
   - Gets or creates user profile in PostgreSQL (with Redis caching)
   - Attaches user info to `req.user` and `req.userProfile`
3. Controllers use `req.userProfile.id` to query user-specific data

## Best Practices

### 1. Always Check Authentication
All protected routes should use the `authenticate` middleware.

### 2. Cache Invalidation
When updating data, always invalidate related caches to ensure consistency.

### 3. Pagination
Use `limit` and `offset` for large datasets to improve performance.

### 4. Error Handling
All controllers have try-catch blocks and return appropriate HTTP status codes.

### 5. Data Ownership
All queries verify data ownership by checking `user_id` matches the authenticated user.

## Performance Considerations

1. **Redis Caching**: Reduces database load by caching frequently accessed data
2. **Database Indexes**: Indexes on foreign keys and frequently queried columns
3. **Connection Pooling**: PostgreSQL connection pool for efficient connections
4. **Pagination**: Limits query results to prevent loading large datasets

## Monitoring

Monitor these metrics:
- Redis hit/miss ratio
- Database query performance
- API response times
- Cache invalidation frequency

## Future Enhancements

1. **Batch Operations**: Bulk create/update/delete for jobs and resumes
2. **Search**: Full-text search for jobs and resumes
3. **Analytics**: Track user activity and interview progress
4. **Notifications**: Email/push notifications for job updates
5. **File Storage**: Integrate S3 or similar for resume uploads
6. **Rate Limiting**: Implement rate limiting per user
7. **Audit Logs**: Track changes to user data for security

## Troubleshooting

### Redis Connection Issues
- Verify Redis is running: `docker-compose ps`
- Check Redis URL in `.env`
- Check Redis logs: `docker-compose logs redis`

### Database Migration Issues
- Verify PostgreSQL is running: `docker-compose ps`
- Check database credentials in `.env`
- Manually connect: `psql -h localhost -U system -d mockinterview`

### Authentication Issues
- Verify Firebase credentials in `.env`
- Check token format: `Bearer <token>`
- Enable AUTH_ENABLED=true in `.env`
