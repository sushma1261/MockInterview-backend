# Quick Reference - Mock Interview Backend

## 📖 Documentation Index

1. **[APIs.md](./APIs.md)** - Complete API documentation with all endpoints
2. **[SYSTEM_DESIGN_REVIEW.md](./SYSTEM_DESIGN_REVIEW.md)** - Comprehensive system design analysis and recommendations

---

## 🚀 Quick Start

### Start Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
npm start
```

### Run Migrations
```bash
npm run migrate
```

---

## 🔑 Key Endpoints

### Authentication
All endpoints (except health checks) require: `Authorization: Bearer <firebase-token>`

### Core Features

| Feature | Endpoint | Method |
|---------|----------|--------|
| **Chat Interview** | `/api/chat` | POST |
| **Streaming Chat** | `/api/chat/stream` | POST |
| **Upload Resume** | `/api/user/resumes/upload` | POST |
| **User Profile** | `/api/user/profile` | GET/PUT |
| **Interview History** | `/api/history` | GET |
| **Job Postings** | `/api/recruitment/jobs` | GET/POST |
| **Resume Screening** | `/api/recruitment/jobs/:id/screen` | POST |

---

## 📊 System Architecture

```
User → Firebase Auth → Express API → Controllers → Services → Database
                                                           ↓
                                              PostgreSQL + Redis + Google AI
```

### Technology Stack
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL with pgvector
- **Cache**: Redis
- **Auth**: Firebase Authentication
- **AI**: Google Gemini

---

## 🎯 Critical Improvements Needed Before Production

### 🔴 High Priority
1. ✅ **API Documentation** (Done - APIs.md)
2. ❌ **Input Validation** (Add zod/joi)
3. ❌ **Rate Limiting** (Add express-rate-limit)
4. ❌ **CORS Configuration** (Restrict origins)
5. ❌ **Error Handling** (Centralized + structured logging)

### 🟡 Medium Priority
6. ❌ **API Versioning** (/api/v1/...)
7. ❌ **Testing** (Jest + Supertest)
8. ❌ **Monitoring** (Sentry/Winston)
9. ❌ **Security Headers** (helmet.js)
10. ❌ **Database Pool Config** (Optimize settings)

### 🟢 Low Priority
11. ❌ **Swagger UI** (Interactive docs)
12. ❌ **Response Caching** (apicache)
13. ❌ **CI/CD Pipeline** (GitHub Actions)
14. ❌ **Audit Logging** (Track changes)

---

## 👥 User Roles

- **Admin**: First user, manages all roles
- **HR**: Posts jobs, screens resumes
- **Candidate**: Uploads resumes, practices interviews
- **Interviewer**: (Future) Conducts interviews
- **Hiring Manager**: (Future) Reviews candidates

---

## 🗄️ Database Schema Overview

### Core Tables
- `user_profiles` - User accounts
- `user_roles` - Role-based access control
- `resumes` - Resume files and content
- `resume_chunks` - Vector embeddings for AI
- `job_descriptions` - Job postings
- `resume_applications` - Screened candidates
- `interview_sessions` - Interview history
- `chat_messages` - Conversation logs
- `question_feedback` - Interview feedback

### Key Relationships
```
user_profiles (1) → (n) resumes → (n) resume_chunks
user_profiles (1) → (n) user_roles
user_profiles (1) → (n) interview_sessions → (n) chat_messages
job_descriptions (1) → (n) resume_applications → (1) resumes
```

---

## 🔒 Security Features

### Current
✅ Firebase JWT authentication  
✅ Role-based authorization  
✅ SQL injection prevention (parameterized queries)  
✅ Graceful shutdown  
✅ File type validation (PDF only)  

### Missing
❌ Rate limiting  
❌ Input validation  
❌ CORS restrictions  
❌ Security headers  
❌ Request timeouts  

---

## 📈 Performance Features

✅ PostgreSQL connection pooling  
✅ Redis caching for active sessions  
✅ Vector indexing (HNSW) for fast similarity search  
✅ Singleton pattern for shared resources  
✅ Server-sent events for streaming  

---

## 🌍 Environment Variables

### Required
```bash
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=mockinterview
GOOGLE_API_KEY=your_api_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_email
FIREBASE_PRIVATE_KEY=your_key
```

### Optional
```bash
PORT=8080
AUTH_ENABLED=true
REDIS_URL=redis://localhost:6379
NODE_ENV=development
AI_DISABLED=false
```

See [.env.example](./.env.example) for complete list.

---

## 🧪 Testing (To Be Implemented)

```bash
# Recommended setup
npm install --save-dev jest @types/jest ts-jest supertest

# Run tests
npm test

# Run with coverage
npm run test:coverage
```

---

## 📦 Project Structure

```
src/
├── config/          # Configuration (Firebase, Redis, Prompts)
├── controllers/     # Request handlers
├── db/              # Database (migrations, pool)
├── middleware/      # Auth, validation
├── routes/          # API routes
├── services/        # Business logic
├── types/           # TypeScript types
└── utils/           # Helper functions
```

---

## 🔄 Key Workflows

### Mock Interview Flow
1. User uploads resume → Text extraction → Vector embeddings
2. User starts interview → AI generates questions based on resume
3. User answers → AI provides feedback
4. Session saved to PostgreSQL for history

### Resume Screening Flow
1. HR posts job description
2. HR screens all candidate resumes → AI calculates match scores
3. HR reviews top candidates → Creates applications
4. HR manages candidate pipeline (shortlist/reject/interview)

---

## 📊 API Response Patterns

### Success
```json
{
  "success": true,
  "data": { /* result */ }
}
```

### Error
```json
{
  "error": "Error message",
  "details": "Additional context"
}
```

### Pagination (Recommended to implement)
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

## 🎨 UI Development Tips

### State Management Considerations
- Use React Query/SWR for API calls and caching
- Store auth token in memory + HTTP-only cookie
- Implement optimistic updates for better UX

### Real-time Features
- Use SSE for streaming interview responses (`/api/chat/stream`)
- Consider adding WebSocket for collaborative features
- Implement retry logic for failed connections

### File Upload
- Use FormData for resume uploads
- Show progress bars (track upload progress)
- Validate file size client-side before upload
- Handle large files with chunked uploads (future)

### Recommended UI Structure
```
pages/
├── auth/           # Login/Register
├── dashboard/      # User dashboard
├── interview/      # Interview interface
├── resumes/        # Resume management
├── history/        # Interview history
└── recruitment/    # HR features
    ├── jobs/       # Job postings
    ├── screening/  # Resume screening
    └── candidates/ # Application management
```

---

## 🐛 Common Issues & Solutions

### Issue: "No user ID or profile ID"
**Solution**: Ensure Authorization header is set correctly

### Issue: Resume upload fails
**Solution**: Check file is PDF, < 10MB, and `AUTH_ENABLED=true`

### Issue: Redis connection error
**Solution**: Ensure Redis is running: `redis-server`

### Issue: Database connection failed
**Solution**: Check PostgreSQL is running and credentials are correct

### Issue: Vector search not working
**Solution**: Ensure pgvector extension is installed: `CREATE EXTENSION vector;`

---

## 📞 Support & Resources

### Documentation
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Redis Docs](https://redis.io/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Firebase Auth](https://firebase.google.com/docs/auth)
- [Google AI](https://ai.google.dev/docs)

### Tools
- **Database Client**: pgAdmin, DBeaver, TablePlus
- **Redis Client**: RedisInsight, Redis CLI
- **API Testing**: Postman, Insomnia, Thunder Client
- **Monitoring**: Sentry, Datadog, New Relic

---

## 📝 Next Steps

### Before UI Development
1. Read `SYSTEM_DESIGN_REVIEW.md` for detailed improvements
2. Implement critical security features (validation, CORS, rate limiting)
3. Set up proper error handling and logging
4. Create API client library for UI (types + fetch wrappers)

### During UI Development
1. Use the endpoints documented in `APIs.md`
2. Implement proper error handling in UI
3. Add loading states for all async operations
4. Handle authentication flow (login, logout, token refresh)

### Before Production
1. Implement all high-priority improvements
2. Add comprehensive testing (unit + integration)
3. Set up monitoring and alerting
4. Configure CI/CD pipeline
5. Perform security audit
6. Load testing and performance optimization

---

## 📅 Estimated Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase 1** | 3-4 days | Critical security improvements |
| **Phase 2** | 5-7 days | UI development (basic features) |
| **Phase 3** | 3-4 days | Testing + monitoring setup |
| **Phase 4** | 2-3 days | Production deployment prep |
| **Total** | ~3 weeks | Full system ready for production |

---

## ✅ Current Status

**Backend**: ⭐⭐⭐⭐ (4/5)
- Strong architecture ✅
- Core features complete ✅
- Security hardening needed ⚠️
- Production readiness in progress 🔄

**Ready for**: ✅ UI Development (with security improvements in parallel)  
**Not ready for**: ❌ Production deployment (need security hardening)

---

*Last Updated: 2024-11-23*  
*For detailed information, see [APIs.md](./APIs.md) and [SYSTEM_DESIGN_REVIEW.md](./SYSTEM_DESIGN_REVIEW.md)*
