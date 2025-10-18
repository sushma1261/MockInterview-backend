# API Testing Examples

This file contains example requests for testing the User Profile API endpoints.

## Setup

1. Get a Firebase authentication token from your frontend or Firebase console
2. Replace `<YOUR_FIREBASE_TOKEN>` with your actual token in the examples below
3. Use tools like Postman, curl, or HTTPie to test the endpoints

## Environment

```bash
BASE_URL=http://localhost:8080
TOKEN=<YOUR_FIREBASE_TOKEN>
```

## User Profile Endpoints

### Get Current User Profile
```bash
curl -X GET \
  http://localhost:8080/api/user/profile \
  -H "Authorization: Bearer ${TOKEN}"
```

### Update User Profile
```bash
curl -X PUT \
  http://localhost:8080/api/user/profile \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "John Doe Updated",
    "photo_url": "https://example.com/photo.jpg"
  }'
```

## User Preferences Endpoints

### Get User Preferences
```bash
curl -X GET \
  http://localhost:8080/api/user/preferences \
  -H "Authorization: Bearer ${TOKEN}"
```

### Update User Preferences
```bash
curl -X PUT \
  http://localhost:8080/api/user/preferences \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "interview_difficulty": "hard",
    "interview_duration": 60,
    "preferred_languages": ["JavaScript", "Python", "Go"],
    "theme": "dark",
    "notification_enabled": true
  }'
```
## Resume Endpoints

### Create a New Resume
```bash
curl -X POST \
  http://localhost:8080/api/user/resumes \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Software Engineer Resume 2025",
    "file_name": "resume_2025.pdf",
    "file_path": "/uploads/resume_2025.pdf",
    "file_size": 204800,
    "content": "John Doe\nSoftware Engineer\n...",
    "is_primary": true
  }'
```

### Get All Resumes
```bash
curl -X GET \
  http://localhost:8080/api/user/resumes \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Primary Resume
```bash
curl -X GET \
  http://localhost:8080/api/user/resumes/primary \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Single Resume (replace :id with actual resume ID)
```bash
curl -X GET \
  http://localhost:8080/api/user/resumes/1 \
  -H "Authorization: Bearer ${TOKEN}"
```

### Update Resume
```bash
curl -X PUT \
  http://localhost:8080/api/user/resumes/1 \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Resume Title",
    "content": "Updated content..."
  }'
```

### Set Resume as Primary
```bash
curl -X PUT \
  http://localhost:8080/api/user/resumes/2/set-primary \
  -H "Authorization: Bearer ${TOKEN}"
```

### Delete Resume
```bash
curl -X DELETE \
  http://localhost:8080/api/user/resumes/1 \
  -H "Authorization: Bearer ${TOKEN}"
```

## Testing Workflow Example

### Complete user flow test:

```bash
# 1. Get user profile (auto-created on first authenticated request)
curl -X GET http://localhost:8080/api/user/profile \
  -H "Authorization: Bearer ${TOKEN}"

# 2. Update preferences
curl -X PUT http://localhost:8080/api/user/preferences \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"interview_difficulty": "medium", "theme": "dark"}'

# 3. Create a resume
RESUME_RESPONSE=$(curl -X POST http://localhost:8080/api/user/resumes \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"title": "My Resume", "is_primary": true}')

## Postman Collection

You can import these requests into Postman:

1. Create a new collection named "User Profile API"
2. Add an environment variable `TOKEN` with your Firebase token
3. Add the requests above to the collection
4. Use `{{TOKEN}}` in the Authorization header

## Testing with HTTPie

If you prefer HTTPie (more human-friendly):

```bash
# Get profile
http GET localhost:8080/api/user/profile \
  Authorization:"Bearer ${TOKEN}"

# Update preferences
http PUT localhost:8080/api/user/preferences \
  Authorization:"Bearer ${TOKEN}" \
  theme=dark \
  interview_difficulty=hard
```

## Expected Response Codes

- `200 OK`: Successful GET, PUT, DELETE
- `201 Created`: Successful POST (resource created)
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid auth token
- `404 Not Found`: Resource doesn't exist
- `500 Internal Server Error`: Server error

## Common Issues

### 401 Unauthorized
- Check if AUTH_ENABLED=true in .env
- Verify Firebase token is valid and not expired
- Ensure token is in format: "Bearer <token>"

### 404 Not Found
- Verify the resource ID exists
- Check that the resource belongs to the authenticated user

### 500 Internal Server Error
- Check server logs
- Verify PostgreSQL and Redis are running
- Check database migrations have run
