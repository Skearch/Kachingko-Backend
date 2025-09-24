## Features
- Philippine phone number validation and normalization
- SMS OTP verification via Semaphore (Philippines-optimized)
- Email verification with OTP via Brevo SMTP
- PIN-based authentication with JWT tokens
- Secure email change process with dual verification (SMS + Email)
- Duplicate request protection middleware
- SQLite database with Sequelize ORM
- Comprehensive logging system with Philippine timezone
- Robust error handling and validation
- Memory-based OTP code management with automatic cleanup
- Automatic expired code cleanup every 10 minutes

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Configure your .env file (see below)
# Start development server
npm run dev
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=20394
NODE_ENV=development

# Semaphore SMS Configuration (Required for SMS OTP)
SEMAPHORE_API_KEY=your_semaphore_api_key
SEMAPHORE_SENDER_NAME=KACHINGKO

# Brevo SMTP Configuration (Required for Email OTP)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_brevo_smtp_login   # e.g. 8d520b004@smtp-brevo.com
SMTP_PASS=your_brevo_smtp_key     # e.g. xBD740p26vJjmgyd
SMTP_FROM=Kachingko <your_verified_sender@email.com>

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=1h

# Logging Configuration (Philippine defaults)
LOG_LEVEL=INFO
LOG_LOCALE=en-PH
LOG_TIMEZONE=Asia/Manila
```

## Service Providers
- **SMS Service**: Semaphore
- **Email Service**: Brevo

## Phone Number Format
All formats are automatically normalized to `+639XXXXXXXXX` internally:
- `09123456789` → `+639123456789`
- `639123456789` → `+639123456789` 
- `+639123456789` → `+639123456789` (unchanged)

## Security Features

### Duplicate Request Protection
All sensitive endpoints are protected against duplicate requests:
- **Email verification processes**: Prevents same code from being processed simultaneously
- **Account creation**: Prevents duplicate account creation attempts  
- **Login attempts**: Rate limits rapid login attempts
- **SMS/Email sending**: Prevents spam verification messages

### Rate Limiting
- **SMS verification**: 1 request per minute per phone number
- **Email verification**: 1 request per minute per email
- **Failed verification attempts**: Maximum 3 attempts per OTP code
- **Duplicate requests**: Returns HTTP 429 with clear error message

### Memory Management
- **SMS OTP codes**: 5-minute expiration, stored in memory
- **Email OTP codes**: 5-minute expiration, stored in memory
- **Automatic cleanup**: Expired codes removed every 10 minutes
- **Attempt limiting**: Maximum 3 attempts per code before deletion

## Complete API Flow

### 1. Account Creation Process

#### Step 1: Check if Account Exists
```http
GET /api/accounts/exists/09123456789
```
**Response:**
```json
{
  "success": true,
  "message": "Account existence checked",
  "data": { "exists": false }
}
```

#### Step 2: Send SMS Verification
```http
POST /api/accounts/send-verification
Content-Type: application/json

{
  "phoneNumber": "+639123456789"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Verification code sent",
  "data": {
    "status": "pending",
    "to": "+639123456789",
    "messageId": "semaphore_message_id"
  }
}
```

#### Step 3: Verify SMS Code
```http
POST /api/accounts/verify-code
Content-Type: application/json

{
  "phoneNumber": "+639123456789",
  "code": "123456"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Code verification completed",
  "data": { "verified": true }
}
```

#### Step 4: Create Account
```http
POST /api/accounts/create
Content-Type: application/json

{
  "phoneNumber": "+639123456789",
  "pin": "123456"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "account": {
      "id": 1,
      "phoneNumber": "+639123456789",
      "smsVerified": true,
      "emailVerified": false,
      "fullyVerified": false,
      "kycStatus": "not_submitted",
      "createdAt": "2025-01-XX",
      "updatedAt": "2025-01-XX"
    },
    "token": "jwt_token_here"
  }
}
```

### 2. Login Process

```http
POST /api/accounts/login
Content-Type: application/json

{
  "phoneNumber": "+639123456789",
  "pin": "123456"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Login successful", 
  "data": {
    "account": { /* account data */ },
    "token": "jwt_token_here",
    "message": "Login successful"
  }
}
```

### 3. Email Management

#### Add Email to Account
```http
POST /api/accounts/add-email
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Send Email Verification
```http
POST /api/accounts/send-email-verification
Authorization: Bearer <jwt_token>
```
**Response:**
```json
{
  "success": true,
  "message": "Email verification sent",
  "data": {
    "status": "pending",
    "to": "user@example.com", 
    "messageId": "email_message_id"
  }
}
```

#### Verify Email
```http
POST /api/accounts/verify-email
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "code": "123456"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Email verification completed",
  "data": { "verified": true }
}
```

### 4. Secure Email Change Process

The email change process requires both SMS and email verification for security.

#### Step 1: Request Email Change
```http
POST /api/accounts/request-email-change
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "email": "newemail@example.com"
}
```

#### Step 2: Send SMS Verification for Email Change
```http
POST /api/accounts/send-verification
Content-Type: application/json

{
  "phoneNumber": "+639123456789"
}
```

#### Step 3: Verify SMS Code for Email Change
```http
POST /api/accounts/verify-email-change-sms
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "code": "123456"
}
```

#### Step 4: Verify New Email Code
```http
POST /api/accounts/verify-email-change-email
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "code": "789012"
}
```

## API Endpoints Reference

### Public Endpoints (No Authentication Required)

| Endpoint | Method | Description | Rate Limited |
|----------|--------|-------------|--------------|
| `/api/accounts/exists/:phone` | GET | Check if account exists | ❌ |
| `/api/accounts/send-verification` | POST | Send SMS OTP via Semaphore | ✅ (1/min) |
| `/api/accounts/verify-code` | POST | Verify SMS OTP code | ✅ |
| `/api/accounts/create` | POST | Create new account | ✅ |
| `/api/accounts/login` | POST | Login with PIN | ✅ |

### Protected Endpoints (JWT Authentication Required)

| Endpoint | Method | Description | Rate Limited |
|----------|--------|-------------|--------------|
| `/api/accounts/profile` | GET | Get user profile | ❌ |
| `/api/accounts/add-email` | POST | Add/update email | ✅ |
| `/api/accounts/send-email-verification` | POST | Send email OTP via Brevo | ✅ (1/min) |
| `/api/accounts/verify-email` | POST | Verify email OTP | ✅ |
| `/api/accounts/request-email-change` | POST | Request secure email change | ✅ |
| `/api/accounts/verify-email-change-sms` | POST | Verify SMS for email change | ✅ |
| `/api/accounts/verify-email-change-email` | POST | Complete email change | ✅ |

## Email Templates

The system sends professional HTML emails with:
- **OTP Verification**: Styled verification code emails
- **Welcome Messages**: Sent after successful email verification
- **Security Warnings**: Clear instructions about code security
- **Responsive Design**: Mobile-friendly email layouts

## Error Handling

### Common HTTP Status Codes

| Status | Description | When It Occurs |
|--------|-------------|----------------|
| `200` | Success | Request completed successfully |
| `400` | Bad Request | Invalid input data or format |
| `401` | Unauthorized | Missing or invalid JWT token |
| `409` | Conflict | Account already exists |
| `429` | Too Many Requests | Duplicate request detected |
| `500` | Internal Server Error | Unexpected server error |

### Sample Error Responses

**Duplicate Request:**
```json
{
  "success": false,
  "message": "Duplicate request detected. Please wait."
}
```

**Invalid Phone Number:**
```json
{
  "success": false,
  "message": "Invalid Philippines phone number format. Use format: +639XXXXXXXXX, 09XXXXXXXXX, or 639XXXXXXXXX"
}
```

**Account Already Exists:**
```json
{
  "success": false,
  "message": "Account already exists with this phone number"
}
```

## Authentication

All protected endpoints require a JWT token:

```http
Authorization: Bearer <your_jwt_token>
```

- **Token Duration**: 1 hour (configurable via `JWT_EXPIRES_IN`)
- **Token Payload**: Contains phone number, account ID, verification status
- **Token Security**: Uses strong secret key for signing

## Account Verification Levels

1. **SMS Verified**: ✅ Phone number verified via Semaphore SMS
2. **Email Verified**: ✅ Email address verified via Brevo email  
3. **Fully Verified**: ✅ Both SMS and email verified + KYC completed

## Response Format

All API responses follow this consistent structure:

```json
{
  "success": boolean,
  "message": "descriptive message",
  "data": object | null,
  "error": "error details (only on failures)"
}
```

## Development

### Available Scripts

```bash
npm start      # Production server
npm run dev    # Development with nodemon (auto-reload)
npm test       # Run tests (not implemented yet)
```

### Database Schema

SQLite database with the following `accounts` table structure:

```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phoneNumber VARCHAR(255) UNIQUE NOT NULL,
  pin VARCHAR(6) NOT NULL,
  email VARCHAR(255) NULL,
  pendingEmail VARCHAR(255) NULL,
  emailChangeVerificationStep VARCHAR(50) DEFAULT 'none',
  smsVerified BOOLEAN DEFAULT false,
  emailVerified BOOLEAN DEFAULT false,
  fullyVerified BOOLEAN DEFAULT false,
  kycStatus VARCHAR(50) DEFAULT 'not_submitted',
  verificationAttempts INTEGER DEFAULT 0,
  emailVerificationAttempts INTEGER DEFAULT 0,
  lastVerificationSent DATETIME NULL,
  lastEmailVerificationSent DATETIME NULL,
  kycSubmittedAt DATETIME NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL
);
```

### Memory Management

The system uses in-memory storage for OTP codes:
- **SMS codes**: Stored in `SemaphoreService.otpCodes` Map
- **Email codes**: Stored in `BrevoService.emailCodes` Map
- **Automatic cleanup**: Every 10 minutes via cleanup interval
- **Expiration**: 5 minutes for all OTP codes