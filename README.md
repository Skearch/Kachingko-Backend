# Kachingko Backend

A simple e-wallet demo app backend built for our CIA final project. Handles phone verification, account creation, and email verification using Twilio.

## Features

- Phone number verification via SMS OTP
- Email verification support  
- Account creation with PIN authentication
- Philippines phone number validation
- Secure PIN-based login system

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables (see .env section below)
cp .env.example .env  # Create your .env file

# Start development server
npm run dev

# Production
npm start
```

Server runs on: `http://localhost:3000`

## API Endpoints

### Account Management
```bash
GET  /api/accounts/exists/:phone          # Check if account exists
POST /api/accounts/send-verification      # Send SMS OTP
POST /api/accounts/verify-code           # Verify SMS code
POST /api/accounts/create                # Create account with PIN
POST /api/accounts/login                 # Login with PIN
```

### Email Verification
```bash
POST /api/accounts/add-email             # Add email to account
POST /api/accounts/send-email-verification # Send email OTP
POST /api/accounts/verify-email          # Verify email code
```

## Usage Examples

### Account Creation Flow
```json
// 1. Check if phone number exists
GET /api/accounts/exists/09171234567
→ {"success": true, "data": {"exists": false}}

// 2. Send SMS verification
POST /api/accounts/send-verification
{"phoneNumber": "09171234567"}
→ {"success": true, "message": "Verification code sent"}

// 3. Verify SMS code
POST /api/accounts/verify-code
{"phoneNumber": "09171234567", "code": "123456"}
→ {"success": true, "data": {"verified": true}}

// 4. Create account
POST /api/accounts/create
{"phoneNumber": "09171234567", "pin": "123456"}
→ {"success": true, "data": {...}, "message": "Account created successfully"}
```

### Login
```json
POST /api/accounts/login
{"phoneNumber": "09171234567", "pin": "123456"}
→ {"success": true, "data": {"account": {...}, "verificationStatus": {...}}}
```

## Phone Number Format

The API automatically normalizes Philippine phone numbers:
- `09171234567` → `+639171234567`
- Accepts formats: `+63`, `63`, `09` prefixes
- Handles spaces and dashes: `0917-123-4567`

## Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Twilio Configuration (required for SMS/Email verification)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid

# Logging
LOG_LEVEL=INFO
LOG_LOCALE=en-PH
LOG_TIMEZONE=Asia/Manila
```

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite with Sequelize ORM
- **SMS/Email**: Twilio Verify API
- **Logging**: Custom file-based logging

## Development

```bash
npm run dev   # Development with nodemon auto-reload
npm start     # Production mode
```

**Logs**: Check `logs/app.log` and `logs/error.log` for application logs.

## License

MIT License - Built by Skearch