## Features

- Philippine phone number validation and normalization
- SMS OTP via Semaphore (Philippines-optimized)
- Email verification via Brevo SMTP
- PIN-based authentication with JWT tokens
- Duplicate request protection and rate limiting
- SQLite database with automatic cleanup

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys (see below)

# Start development server
npm run dev
```

Server runs on `http://localhost:20394`

## Environment Setup

Create a `.env` file:

```env
# Server
PORT=20394
NODE_ENV=development

# Semaphore SMS (Required)
SEMAPHORE_API_KEY=your_semaphore_api_key
SEMAPHORE_SENDER_NAME=KACHINGKO

# Brevo Email (Required)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_login
SMTP_PASS=your_brevo_key
SMTP_FROM=Kachingko <noreply@yourdomain.com>

# JWT Security
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters
JWT_EXPIRES_IN=24h
```

## API Overview

### Account Creation Flow
1. `GET /api/accounts/exists/:phone` - Check if account exists
2. `POST /api/accounts/send-verification` - Send SMS OTP
3. `POST /api/accounts/verify-code` - Verify SMS code
4. `POST /api/accounts/create` - Create account with PIN
5. `POST /api/accounts/login` - Login with PIN

### Protected Endpoints (Require JWT)
- `GET /api/accounts/profile` - Get user profile
- `POST /api/accounts/add-email` - Add email address
- `POST /api/accounts/send-email-verification` - Send email OTP
- `POST /api/accounts/verify-email` - Verify email
- Email change process with dual verification

## Phone Number Formats

All formats automatically normalize to `+639XXXXXXXXX`:
- `09123456789` → `+639123456789`
- `639123456789` → `+639123456789`
- `+639123456789` ✓ (preferred)

## Example Usage

### Create Account
```bash
# 1. Check if account exists
curl -X GET http://localhost:20394/api/accounts/exists/09123456789

# 2. Send SMS verification
curl -X POST http://localhost:20394/api/accounts/send-verification \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+639123456789"}'

# 3. Verify SMS code
curl -X POST http://localhost:20394/api/accounts/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+639123456789", "code": "123456"}'

# 4. Create account
curl -X POST http://localhost:20394/api/accounts/create \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+639123456789", "pin": "123456"}'
```

### Login
```bash
curl -X POST http://localhost:20394/api/accounts/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+639123456789", "pin": "123456"}'
```

## Response Format

All responses follow this structure:
```json
{
  "success": true,
  "message": "Operation completed",
  "data": { /* response data */ }
}
```

## Security Features

- **Rate Limiting**: 1 SMS/email per minute per number
- **OTP Expiration**: 5-minute expiration for all codes
- **Attempt Limits**: Max 3 verification attempts per code
- **Duplicate Protection**: Prevents simultaneous identical requests
- **Auto Cleanup**: Expired codes removed every 10 minutes

## Health Check

Check service status: `GET /health`

## Scripts

```bash
npm start      # Production server
npm run dev    # Development with auto-reload
```

## Database

Uses SQLite with automatic schema creation. Database file: `database.sqlite`

## License

MIT © Skearch