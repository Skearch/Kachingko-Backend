# Features
- Philippine phone number validation and normalization
- SMS OTP verification via Twilio
- Email verification with OTP via Brevo (formerly Sendinblue)
- PIN-based authentication with JWT tokens
- Secure email change process with dual verification
- SQLite database with Sequelize ORM
- Comprehensive logging system
- Robust error handling and validation

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Twilio Configuration (Required for SMS)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid

# Brevo Configuration (Required for Email)
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=Kachingko

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=24h

# Logging Configuration
LOG_LEVEL=INFO
LOG_LOCALE=en-PH
LOG_TIMEZONE=Asia/Manila
```

## Phone Number Format
All formats are normalized to `+639XXXXXXXXX` internally.

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
    "sid": "verification_sid",
    "status": "pending"
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
  "phoneNumber": "+639123456789",
  "email": "user@example.com"
}
```

#### Send Email Verification
```http
POST /api/accounts/send-email-verification
Authorization: Bearer <jwt_token>
```

#### Verify Email
```http
POST /api/accounts/verify-email
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "phoneNumber": "+639123456789",
  "code": "123456"
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

**Response:**
```json
{
  "success": true,
  "message": "Email change request initiated",
  "data": {
    "message": "Email change requested. SMS verification required first."
  }
}
```

#### Step 2: Send SMS Verification for Email Change
```http
POST /api/accounts/send-verification
Authorization: Bearer <jwt_token>
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
  "phoneNumber": "+639123456789",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "SMS verification completed",
  "data": {
    "message": "SMS verified successfully. Email verification code sent to new email address."
  }
}
```

#### Step 4: Verify New Email Code
```http
POST /api/accounts/verify-email-change-email
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "phoneNumber": "+639123456789",
  "code": "789012"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email change completed",
  "data": {
    "message": "Email changed successfully!",
    "newEmail": "newemail@example.com"
  }
}
```

## API Endpoints Reference

### Public Endpoints (No Authentication Required)

**`GET /api/accounts/exists/:phone`**
- **Description:** Check if an account exists for a given phone number
- **Required:** `phone` parameter in URL
- **Example:** `GET /api/accounts/exists/09123456789`

**`POST /api/accounts/send-verification`**
- **Description:** Send SMS OTP verification code
- **Required:** `phoneNumber` in request body
- **Rate Limited:** 1 request per minute per phone number

**`POST /api/accounts/verify-code`**
- **Description:** Verify SMS OTP code
- **Required:** `phoneNumber`, `code` in request body

**`POST /api/accounts/create`**
- **Description:** Create a new account after SMS verification
- **Required:** `phoneNumber`, `pin` (6 digits) in request body
- **Returns:** Account data and JWT token

**`POST /api/accounts/login`**
- **Description:** Login with phone number and PIN
- **Required:** `phoneNumber`, `pin` (6 digits) in request body
- **Returns:** Account data and JWT token

### Protected Endpoints (JWT Authentication Required)

All protected endpoints require `Authorization: Bearer <jwt_token>` header.

**`GET /api/accounts/profile`**
- **Description:** Get authenticated user's profile information
- **Required:** JWT token only
- **Returns:** Complete account information

**`POST /api/accounts/add-email`**
- **Description:** Add or update email address for account
- **Required:** `phoneNumber`, `email` in request body
- **Note:** Sets email as unverified, requires verification

**`POST /api/accounts/send-email-verification`**
- **Description:** Send email OTP verification code to account's email
- **Required:** JWT token only
- **Rate Limited:** 1 request per minute per email
- **Prerequisites:** Account must have email address

**`POST /api/accounts/verify-email`**
- **Description:** Verify email OTP code
- **Required:** `phoneNumber`, `code` in request body
- **Note:** Marks email as verified on success

**`POST /api/accounts/request-email-change`**
- **Description:** Initiate secure email change process
- **Required:** `email` (new email address) in request body
- **Returns:** Instructions for next verification step

**`POST /api/accounts/verify-email-change-sms`**
- **Description:** Verify SMS code for email change process
- **Required:** `phoneNumber`, `code` in request body
- **Note:** Must complete this before email verification step

**`POST /api/accounts/verify-email-change-email`**
- **Description:** Complete email change by verifying new email code
- **Required:** `phoneNumber`, `code` in request body
- **Note:** Final step - updates email address on success


## Authentication

All protected endpoints require a JWT token in the Authorization header:

```http
Authorization: Bearer <your_jwt_token>
```

Tokens are returned upon successful login or account creation and are valid for 24 hours by default.

## Account Verification Levels

1. **SMS Verified**: Phone number verified via SMS OTP
2. **Email Verified**: Email address verified via email OTP
3. **Fully Verified**: Both SMS and email verified + KYC completed

## Response Format

All API responses follow this consistent format:

```json
{
  "success": boolean,
  "message": "string",
  "data": object | null,
  "error": "string | null (only on errors)"
}
```

## Rate Limiting
- SMS verification: 1 request per minute per phone number
- Email verification: 1 request per minute per email
- Failed verification attempts: 5 attempts before code reset required

## Development

### Available Scripts

```bash
npm start      # Production server
npm run dev    # Development with nodemon
```

### Database Schema

The `accounts` table includes:

```sql
- id (PRIMARY KEY)
- phoneNumber (UNIQUE, NOT NULL)
- pin (NOT NULL, 6 digits)
- email (NULLABLE)
- pendingEmail (NULLABLE)
- emailChangeVerificationStep (ENUM: none, sms_pending, email_pending, completed)
- smsVerified (BOOLEAN)
- emailVerified (BOOLEAN)
- fullyVerified (BOOLEAN)
- kycStatus (ENUM: not_submitted, pending, approved, rejected)
- verificationAttempts (INTEGER)
- emailVerificationAttempts (INTEGER)
- lastVerificationSent (TIMESTAMP)
- lastEmailVerificationSent (TIMESTAMP)
- kycSubmittedAt (TIMESTAMP)
- createdAt (TIMESTAMP)
- updatedAt (TIMESTAMP)
```