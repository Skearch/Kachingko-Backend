# Features
- Philippine phone number validation and normalization
- SMS OTP verification via Twilio
- Email verification with OTP via Brevo SMTP (Nodemailer)
- PIN-based authentication with JWT tokens
- Secure email change process with dual verification
- Duplicate request protection middleware
- SQLite database with Sequelize ORM
- Comprehensive logging system
- Robust error handling and validation
- Memory-based email code management with cleanup
- Automatic expired code cleanup every 10 minutes

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

# Brevo SMTP Configuration (Required for Email)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_brevo_smtp_login   # e.g. 8d520b002@smtp-brevo.com
SMTP_PASS=your_brevo_smtp_key     # e.g. xsmtpsib-...
SMTP_FROM=Kachingko <your_verified_sender@email.com>

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

## Security Features

### Duplicate Request Protection
All sensitive endpoints are protected against duplicate requests to prevent race conditions:
- **Email verification processes**: Prevents same code from being processed simultaneously
- **Account creation**: Prevents duplicate account creation attempts
- **Login attempts**: Rate limits rapid login attempts
- **SMS/Email sending**: Prevents spam verification messages

### Rate Limiting
- **SMS verification**: 1 request per minute per phone number
- **Email verification**: 1 request per minute per email
- **Failed verification attempts**: 5 attempts before code reset required
- **Duplicate requests**: Returns HTTP 429 with clear error message

### Memory Management
- **Email codes**: Stored in memory with 5-minute expiration
- **Automatic cleanup**: Expired codes removed every 10 minutes
- **Attempt limiting**: Maximum 3 attempts per email code

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
- **Duplicate Protection:** Prevents spam SMS sending

**`POST /api/accounts/verify-code`**
- **Description:** Verify SMS OTP code
- **Required:** `phoneNumber`, `code` in request body
- **Duplicate Protection:** Prevents same code from being processed twice

**`POST /api/accounts/create`**
- **Description:** Create a new account after SMS verification
- **Required:** `phoneNumber`, `pin` (6 digits) in request body
- **Returns:** Account data and JWT token
- **Duplicate Protection:** Prevents duplicate account creation

**`POST /api/accounts/login`**
- **Description:** Login with phone number and PIN
- **Required:** `phoneNumber`, `pin` (6 digits) in request body
- **Returns:** Account data and JWT token
- **Duplicate Protection:** Rate limits rapid login attempts

### Protected Endpoints (JWT Authentication Required)

All protected endpoints require `Authorization: Bearer <jwt_token>` header.

**`GET /api/accounts/profile`** 
- **Description:** Get authenticated user's profile information
- **Required:** JWT token only
- **Returns:** Complete account information

**`POST /api/accounts/add-email`**
- **Description:** Add or update email address for account
- **Required:** `email` in request body
- **Note:** Phone number extracted from JWT token
- **Duplicate Protection:** Prevents duplicate email addition requests

**`POST /api/accounts/send-email-verification`**
- **Description:** Send email OTP verification code to account's email
- **Required:** JWT token only
- **Rate Limited:** 1 request per minute per email
- **Prerequisites:** Account must have email address
- **Duplicate Protection:** Prevents spam email sending

**`POST /api/accounts/verify-email`**
- **Description:** Verify email OTP code
- **Required:** `code` in request body
- **Note:** Marks email as verified on success
- **Duplicate Protection:** Prevents same code from being processed twice

**`POST /api/accounts/request-email-change`**
- **Description:** Initiate secure email change process
- **Required:** `email` in request body
- **Returns:** Instructions for next verification step
- **Duplicate Protection:** Prevents duplicate email change requests

**`POST /api/accounts/verify-email-change-sms`**
- **Description:** Verify SMS code for email change process
- **Required:** `code` in request body
- **Note:** Must complete this before email verification step
- **Duplicate Protection:** Prevents duplicate SMS verification attempts

**`POST /api/accounts/verify-email-change-email`**
- **Description:** Complete email change by verifying new email code
- **Required:** `code` in request body
- **Note:** Final step - updates email address on success
- **Duplicate Protection:** Prevents race conditions during final step

## Error Handling

### Duplicate Request Response
When duplicate requests are detected, you'll receive:

```json
{
  "success": false,
  "message": "Duplicate request detected. Please wait."
}
```
**HTTP Status:** `429 Too Many Requests`

### Common Error Responses

**Authentication Failed:**
```json
{
  "success": false,
  "message": "Authentication failed"
}
```
**HTTP Status:** `401 Unauthorized`

**Validation Error:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": ["PIN must be exactly 6 digits"]
}
```
**HTTP Status:** `400 Bad Request`

**Account Already Exists:**
```json
{
  "success": false,
  "message": "Account already exists with this phone number"
}
```
**HTTP Status:** `409 Conflict`

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