# User Profile System Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT APPLICATION                       │
│                    (React/Next.js Frontend)                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP Request + Firebase JWT Token
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS.JS BACKEND                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Authentication Middleware                       │  │
│  │  1. Verify Firebase Token                                │  │
│  │  2. Extract User Info (uid, email, name)                 │  │
│  │  3. Get/Create User Profile in DB (with Redis cache)     │  │
│  │  4. Attach to req.user & req.userProfile                 │  │
│  └─────────────────────┬────────────────────────────────────┘  │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Controllers Layer                            │  │
│  │  - UserProfileController                                  │  │
│  │  - Handles HTTP request/response                          │  │
│  │  - Input validation                                       │  │
│  │  - Calls appropriate service methods                      │  │
│  └─────────────────────┬────────────────────────────────────┘  │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Services Layer                               │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ UserProfileService | JobService | ResumeService    │  │  │
│  │  │ - Business logic                                    │  │  │
│  │  │ - Cache management                                  │  │  │
│  │  │ - Data transformations                              │  │  │
│  │  └───────────────────┬────────────────────────────────┘  │  │
│  └────────────────────────┼────────────────────────────────┘  │
└────────────────────────┼──┼─────────────────────────────────────┘
                         │  │
            ┌────────────┘  └────────────┐
            │                             │
            ▼                             ▼
   ┌─────────────────┐         ┌─────────────────┐
   │  REDIS CACHE    │         │   POSTGRESQL    │
   │  Port: 6379     │         │   Port: 5432    │
   ├─────────────────┤         ├─────────────────┤
   │ Cache Keys:     │         │ Tables:         │
   │ - user:uid      │         │ - user_profiles │
   │ - prefs:id      │         │ - preferences   │
   │ - job:id        │         │ - jobs          │
   │ - resume:id     │         │ - resumes       │
   │                 │         │ - sessions      │
   │ TTL: 30m-1h     │         │ + Indexes       │
   └─────────────────┘         └─────────────────┘
```

## Request Flow Example: Get User Profile

```
1. Client Request
   ├─> GET /api/user/profile
   └─> Header: Authorization: Bearer <firebase-token>

2. Middleware: authenticate()
   ├─> Verify Firebase token with Firebase Admin SDK
   ├─> Extract user data: { uid, email, name, picture }
   ├─> Check Redis: "user:<uid>"
   │   ├─> Cache HIT: Return cached profile ✅
   │   └─> Cache MISS: Continue to DB ⏩
   ├─> Query PostgreSQL: SELECT * FROM user_profiles WHERE firebase_uid = ?
   │   ├─> Found: Return existing profile
   │   └─> Not Found: CREATE new profile with default preferences
   ├─> Cache result in Redis (TTL: 1 hour)
   └─> Attach to req.userProfile

3. Controller: getUserProfile()
   ├─> Read req.userProfile (already loaded by middleware)
   └─> Return JSON response

4. Response to Client
   └─> 200 OK with user profile data
```

## Request Flow Example: Create Job

```
1. Client Request
   ├─> POST /api/user/jobs
   ├─> Header: Authorization: Bearer <firebase-token>
   └─> Body: { title, company, description, ... }

2. Middleware: authenticate()
   ├─> Verify token
   ├─> Load user profile (cached or from DB)
   └─> Attach to req.userProfile

3. Controller: createJob()
   ├─> Extract req.body
   ├─> Call jobService.createJob(req.userProfile.id, data)
   └─> Return response

4. Service: JobService.createJob()
   ├─> Validate data
   ├─> INSERT INTO jobs (...) VALUES (...)
   ├─> Get new job record
   ├─> Invalidate user's job list cache
   │   └─> DELETE Redis keys: "user_jobs:<user_id>:*"
   └─> Return job object

5. Response to Client
   └─> 201 Created with new job data
```

## Caching Strategy Flow

```
READ Operation (e.g., Get User Profile)
┌─────────────────────────────────────────┐
│ 1. Check Redis Cache                    │
│    Key: "user:<firebase_uid>"           │
└────────┬───────────────────────┬────────┘
         │                       │
    Cache HIT                Cache MISS
         │                       │
         ▼                       ▼
  ┌──────────────┐      ┌──────────────────┐
  │ Return Data  │      │ Query PostgreSQL │
  │ (Fast!)      │      │ (Slower)         │
  └──────────────┘      └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Cache in Redis   │
                        │ TTL: 1 hour      │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Return Data      │
                        └──────────────────┘

WRITE Operation (e.g., Update Job)
┌─────────────────────────────────────────┐
│ 1. Update PostgreSQL                    │
│    UPDATE jobs SET ... WHERE ...        │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ 2. Invalidate Related Caches            │
│    - Delete "job:<job_id>"              │
│    - Delete "user_jobs:<user_id>:*"     │
│    - Delete "user_jobs:stats:<user_id>" │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ 3. Return Updated Data                  │
│ (Next read will re-cache)               │
└─────────────────────────────────────────┘
```

## Database Relationships

```
┌──────────────────────────────────────────────────────────────┐
│                      user_profiles                            │
│  ┌────┬──────────────┬───────┬──────────────┬───────────┐   │
│  │ id │ firebase_uid │ email │ display_name │ photo_url │   │
│  └─┬──┴──────────────┴───────┴──────────────┴───────────┘   │
│    │                                                          │
│    └─────────────┬──────────────────┬────────────────────┐  │
└──────────────────┼──────────────────┼────────────────────┼──┘
                   │                  │                    │
                   ▼                  ▼                    ▼
    ┌──────────────────────┐  ┌──────────────┐  ┌──────────────┐
    │ user_preferences     │  │    jobs      │  │   resumes    │
    │ ┌───────────────┐    │  │ ┌──────────┐ │  │ ┌──────────┐ │
    │ │ user_id (FK)  │    │  │ │ user_id  │ │  │ │ user_id  │ │
    │ │ difficulty    │    │  │ │ title    │ │  │ │ title    │ │
    │ │ duration      │    │  │ │ company  │ │  │ │ file_path│ │
    │ │ languages[]   │    │  │ │ status   │ │  │ │ content  │ │
    │ │ theme         │    │  │ └────┬─────┘ │  │ └────┬─────┘ │
    │ └───────────────┘    │  └──────┼───────┘  └──────┼───────┘
    │ One-to-One           │         │                  │
    └──────────────────────┘         │                  │
                                     └────────┬─────────┘
                                              │
                                              ▼
                                   ┌──────────────────────┐
                                   │ interview_sessions   │
                                   │ ┌──────────────────┐ │
                                   │ │ user_id (FK)     │ │
                                   │ │ job_id (FK)      │ │
                                   │ │ resume_id (FK)   │ │
                                   │ │ session_type     │ │
                                   │ │ status           │ │
                                   │ │ score            │ │
                                   │ └──────────────────┘ │
                                   │ Many-to-Many Link    │
                                   └──────────────────────┘
```

## Service Dependencies

```
┌────────────────────────────────────────────────────────┐
│                    Express App                          │
└───────────────────┬────────────────────────────────────┘
                    │
                    ├──> Routes (userProfile.route.ts)
                    │      │
                    │      └──> Controllers
                    │             │
                    │             ├──> UserProfileController
                    │             │      ├──> UserProfileService
                    │             │      │      ├──> PostgreSQL Pool
                    │             │      │      └──> Redis Client
                    │             │
                    │             ├──> JobController
                    │             │      ├──> JobService
                    │             │      │      ├──> PostgreSQL Pool
                    │             │      │      └──> Redis Client
                    │             │
                    │             └──> ResumeController
                    │                    ├──> ResumeService
                    │                    │      ├──> PostgreSQL Pool
                    │                    │      └──> Redis Client
                    │
                    ├──> Middleware (auth.ts)
                    │      ├──> Firebase Admin SDK
                    │      └──> UserProfileService
                    │
                    └──> Config
                           ├──> firebase.ts
                           ├──> redis.ts
                           └──> db/pool.ts
```

## API Endpoint Structure

```
/api/user/
├── profile/
│   ├── GET     - Get current user profile
│   ├── PUT     - Update profile
│   └── DELETE  - Delete account
│
├── preferences/
│   ├── GET     - Get preferences
│   └── PUT     - Update preferences
│
├── jobs/
│   ├── POST    - Create new job
│   ├── GET     - List all jobs (with filters)
│   ├── /:id/
│   │   ├── GET     - Get single job
│   │   ├── PUT     - Update job
│   │   └── DELETE  - Delete job
│   └── statistics/
│       └── GET     - Job statistics
│
└── resumes/
    ├── POST    - Create new resume
    ├── GET     - List all resumes
    ├── primary/
    │   └── GET     - Get primary resume
    └── /:id/
        ├── GET     - Get single resume
        ├── PUT     - Update resume
        ├── DELETE  - Delete resume
        └── set-primary/
            └── PUT     - Set as primary
```

## Docker Container Architecture

```
┌────────────────────────────────────────────────────────┐
│              Docker Network: backend_network            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  PostgreSQL  │  │    Redis     │  │   Backend    │ │
│  │  Container   │  │  Container   │  │   App        │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤ │
│  │ Port: 5432   │  │ Port: 6379   │  │ Port: 8080   │ │
│  │ Image:       │  │ Image:       │  │ Built from   │ │
│  │ ankane/      │  │ redis:7-     │  │ Dockerfile   │ │
│  │ pgvector     │  │ alpine       │  │              │ │
│  │              │  │              │  │ Depends on:  │ │
│  │ Volume:      │  │ Volume:      │  │ - postgres   │ │
│  │ postgres_    │  │ redis_data   │  │ - redis      │ │
│  │ data         │  │              │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         ▲                 ▲                  │         │
│         │                 │                  │         │
│         └─────────────────┴──────────────────┘         │
│                    Networked                           │
└────────────────────────────────────────────────────────┘
                          │
                          │ Exposed Ports
                          ▼
                    Host Machine
                    - PostgreSQL: localhost:5432
                    - Redis: localhost:6379
                    - Backend: localhost:8080
```

This architecture provides:
- ✅ Separation of concerns (Controllers → Services → Data)
- ✅ Caching layer for performance
- ✅ Automatic user profile creation
- ✅ Data ownership and security
- ✅ Scalable and maintainable design
