# Tilly - AI-Powered Calendar Assistant

A modern React calendar application with AI-powered natural language event scheduling using Claude (Anthropic API), iCal import/export, and email calendar invitations.

## 📧 Email Configuration (For Calendar Invitations)

To enable calendar invitations, create a `.env` file in the root directory with:

```env
# Anthropic API Key (required for AI features)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Email Configuration (required for calendar invitations)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# For Gmail:
# 1. Enable 2-factor authentication
# 2. Generate an "App Password" (not your regular password)
# 3. Use the app password as EMAIL_PASS
```

**Note**: For production, consider using dedicated email services like SendGrid, AWS SES, or Mailgun.

## Screenshot

<img src='screen-shots/demo.png' alt='screenshot of the demo running' height='400' width='800' />

## Features

- **AI Chat Integration**: Natural language event creation using Claude API
- **Drag & Drop**: Move events between time slots and days
- **Event Resizing**: Drag event edges to change duration
- **Inline Editing**: Click event titles to edit in place
- **Professional UI**: Clean, modern calendar interface
- **Real-time Updates**: Instant visual feedback for all interactions

## Tech Stack

- React 17 with hooks
- TypeScript
- [Vite](https://vitejs.dev/) for development and building
- Anthropic Claude API for AI chat
- Custom calendar implementation (no external calendar libraries)
- ESLint and Prettier

## Setup

1. Clone this repository
2. Run `npm install` or `yarn` to install dependencies
3. Create a `.env` file in the root directory:
   ```
   VITE_ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```
4. Get your API key from [Anthropic Console](https://console.anthropic.com/)

## Running 

### Option 1: Full AI Functionality (Recommended)
To run with real Anthropic API integration:

```bash
# Run both frontend and backend together
npm run dev:full

# Or run them separately in different terminals:
# Terminal 1: Backend proxy server
npm run server

# Terminal 2: Frontend development server  
npm run dev
```

### Option 2: Local Parser Only
To run with just the enhanced local parser:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`
The proxy server runs on `http://localhost:3001`

## AI Chat Usage

The AI assistant "Tilly" can understand natural language requests like:
- "Schedule a meeting tomorrow at 2pm"
- "Book dentist appointment Friday 3pm"
- "Lunch with Sarah next week"
- "Gym session Monday 6am"
- "Coffee meeting today at 10am"
- "Doctor appointment Wednesday 3:30pm"

The AI will parse your request and offer to add the event to your calendar.

## Current Status

**✅ Full AI Integration Available!** 

The app now supports real Anthropic Claude API integration through a local proxy server that solves CORS restrictions. You can choose between:

1. **Full AI Mode**: Real Claude API with advanced natural language understanding
2. **Local Parser Mode**: Enhanced pattern matching that works offline

When running in full AI mode, Claude can understand complex requests like:
- "Schedule a team meeting next Tuesday from 2-4pm to discuss the quarterly review"
- "Book a dentist appointment for next Friday afternoon, preferably around 3pm"
- "Set up a coffee chat with Sarah sometime next week"

The local parser provides intelligent scheduling without requiring an API key and handles most common scenarios.

## Note

The enhanced local parser provides intelligent scheduling without requiring an API key, making it work out of the box for most common scheduling scenarios.