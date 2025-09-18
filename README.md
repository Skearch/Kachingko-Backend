# Kachingko Backend Features

- SMS OTP verification (Twilio)
- Email verification
- PIN-based account creation & login
- JWT authentication for protected endpoints
- SQLite database (via Sequelize)
- Robust logging

## Quick Start

```sh
npm install
cp .env.example .env
npm run dev
```

## API Endpoints

**Public:**
- `GET /api/accounts/exists/:phone` — Check if account exists
- `POST /api/accounts/send-verification` — Send SMS OTP
- `POST /api/accounts/verify-code` — Verify SMS code
- `POST /api/accounts/create` — Create account
- `POST /api/accounts/login` — Login

**Protected (JWT required):**
- `GET /api/accounts/profile` — Get profile
- `POST /api/accounts/add-email` — Add email
- `POST /api/accounts/send-email-verification` — Send email OTP
- `POST /api/accounts/verify-email` — Verify email code

## Authentication

After login/account creation, use the returned JWT in requests:

```
Authorization: Bearer <token>
```

## Environment Variables

```
PORT=3000
NODE_ENV=development

TWILIO_ACCOUNT_SID=value
TWILIO_AUTH_TOKEN=value
TWILIO_VERIFY_SERVICE_SID=value

LOG_LEVEL=INFO
LOG_LOCALE=en-PH
LOG_TIMEZONE=Asia/Manila

JWT_SECRET=value
JWT_EXPIRES_IN=value
```

## Phone Number Format

Accepts: `+639XXXXXXXXX`, `09XXXXXXXXX`, `639XXXXXXXXX`  
Auto-normalizes to `+63` format.

## Response Format

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

## Development

```sh
npm run dev
```

Logs: `logs/app.log`, `logs/error.log`