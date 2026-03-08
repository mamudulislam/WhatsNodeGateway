# WhatsApp Automates

A production-ready Node.js backend application that exposes a properly structured RESTful API and integrates with WhatsApp Web. It allows programmatic sending of WhatsApp messages using `whatsapp-web.js`, includes real-time QR code transmission via `Socket.IO`, session persistence, and queue management.

## Features

- **WhatsApp Web Integration:** Uses `whatsapp-web.js`.
- **Real-Time QR Code:** Transmits QR code to the frontend using Socket.IO.
- **Session Persistence:** Does not require re-authentication upon restart (saves locally).
- **Auto-Reconnection:** Gracefully handles disconnections and reinitializes.
- **RESTful API:** Offers an endpoint to send messages.
- **Concurrency & Validation:** Built with `p-queue` to serialize message sending, and `Joi` for payload validation.
- **Security:** Helmet, CORS, and Express Rate Limiter.
- **Error Handling & Logging:** Centralized error handling and structured logging via Winston and Morgan.

## Prerequisites

- Node.js (v16+ recommended)
- Google Chrome or Chromium (required by puppeteer/whatsapp-web.js)

## Setup Instructions

# Server Configuration
  PORT=3000
  RATE_LIMIT_WINDOW_MS=900000
  RATE_LIMIT_MAX_REQUESTS=100


1. **Install dependencies:**
    ```bash
    npm install
    ```

2. **Environment Variables:**
    Create a `.env` file in the root directory (or use the existing one):
    ```env
    PORT=3000
    RATE_LIMIT_WINDOW_MS=900000
    RATE_LIMIT_MAX_REQUESTS=100
    NODE_ENV=development
    ```

3. **Start the Application:**
   For development (uses nodemon):
   ```bash
   npm run dev
   ```
   For production:
   ```bash
   npm start
   ```

4. **Authentication:**
   - Open your browser and navigate to `http://localhost:3000`
   - You will see a QR code. Open WhatsApp on your phone, go to **Linked Devices**, and scan the QR code.
   - Once authenticated, your session is saved in the `.wwebjs_auth` and `.wwebjs_cache` directories.

## API Documentation

### Send Message

**Endpoint:** `POST /api/messages/send`

**Headers:**
`Content-Type: application/json`

**Body:**
```json
{
  "phone": "8801792205520",
  "message": "Hello from Bright Future Soft!"
}
```
*Note: The `phone` field must contain only numeric characters (include country code without + or leading zeros).*

**Response (Success - 200 OK):**
```json
{
  "success": true,
  "message": "Message sent successfully.",
  "data": {
    "success": true,
    "to": "8801792205520",
    "message": "Hello from Bright Future Soft!"
  }
}
```

**Response (Error - 400 Bad Request):**
```json
{
  "error": "\"phone\" must contain only numeric characters"
}
```

## Structure
- `src/controllers/`: Route request handlers.
- `src/services/`: Core logic (WhatsApp and Queue).
- `src/middlewares/`: Express middlewares (Auth, rate limit, logging, error handling).
- `src/routes/`: Route definitions.
- `src/config/`: Configuration setup like Winston logger.
- `public/`: Contains simple HTML UI for socket QR rendering and API validation.
