# TOS & Privacy Policy Manager Chrome Extension

A Chrome extension built with React and Webpack to help users manage terms of service and privacy policies.

## Project Structure

```
tos-privacy-manager/
├── src/
│   ├── background/
│   │   └── background.js          # Service worker for background tasks
│   ├── content/
│   │   └── content.js             # Content script for web page interaction
│   ├── popup/
│   │   ├── Popup.jsx              # React component for popup
│   │   ├── popup.css              # Popup styles
│   │   ├── popup.html             # Popup HTML template
│   │   └── index.js               # Popup entry point
│   ├── options/
│   │   ├── Options.jsx            # React component for options page
│   │   ├── options.css            # Options page styles
│   │   ├── options.html           # Options HTML template
│   │   └── index.js               # Options entry point
│   ├── utils/
│   │   └── dataModels.js          # Data models and API service
│   ├── icons/                     # Extension icons (16x16, 32x32, 48x48, 128x128)
│   └── manifest.json              # Extension manifest
├── dist/                          # Built extension files (generated)
├── webpack.config.js              # Webpack configuration
├── babel.config.json              # Babel configuration
├── package.json                   # Dependencies and scripts
└── README.md                      # This file
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Icon Files

Create the following icon files in `src/icons/`:
- `icon16.png` (16x16 pixels)
- `icon32.png` (32x32 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

### 3. Configure API URL

Update the API base URL in `src/utils/dataModels.js`:

```javascript
this.baseURL = baseURL || 'https://your-api-domain.com/api';
```

### 4. Build the Extension

For development:
```bash
npm run dev
```

For production:
```bash
npm run build
```

### 5. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `dist` folder

## Features

### Website Data Collection
- **Domain**: Automatically extracted from current tab
- **Name**: Extracted from page title, og:title, or og:site_name
- **Favicon URL**: Detected from page or default to /favicon.ico
- **TOS URL**: Auto-detected using multiple strategies
- **Privacy Policy URL**: Auto-detected using multiple strategies
- **Last Crawled**: Timestamp when data was collected
- **Is Active**: Boolean status flag

### Extension Session Data
- **Session Token**: Unique identifier generated per installation
- **Browser Fingerprint**: Generated from browser characteristics
- **User Agent**: Automatically captured
- **IP Address**: Fetched from external service
- **Extension Version**: From manifest.json
- **Is Active**: Boolean status flag
- **Last Activity**: Updated on tab changes

### User Interface
- **Popup**: Shows current site's policy information
- **Options Page**: Configuration and data management
- **Content Script**: Auto-detects and highlights policy links
- **Background Script**: Handles data collection and API communication

## API Integration

The extension expects your backend API to have the following endpoints:

```javascript
POST /api/websites        // Create/update website data
POST /api/sessions        // Create/update session data
PATCH /api/sessions/:id   // Update session activity
GET /api/websites/:domain // Get website information
GET /api/export           // Export user data
```

### Website Data Format
```json
{
  "domain": "example.com",
  "name": "Example Site",
  "favicon_url": "https://example.com/favicon.ico",
  "tos_url": "https://example.com/terms",
  "privacy_policy_url": "https://example.com/privacy",
  "last_crawled_at": "2024-01-01T00:00:00.000Z",
  "is_active": true
}
```

### Session Data Format
```json
{
  "session_token": "session_1234567890_abc123",
  "browser_fingerprint": "base64_encoded_fingerprint",
  "user_agent": "Mozilla/5.0...",
  "ip_address": "123.456.789.0",
  "extension_version": "1.0.0",
  "is_active": true,
  "last_activity": "2024-01-01T00:00:00.000Z"
}
```

## Privacy & Security

- Session tokens are stored locally in Chrome storage
- Browser fingerprints are generated client-side
- No sensitive user data is collected
- All API communications should use HTTPS
- Users can clear session data via options page

## Development Notes

- Uses Webpack for bundling React components
- Babel transpiles modern JavaScript for Chrome compatibility
- Content Security Policy compliant
- Uses Chrome Storage API (not localStorage)
- Manifest v3 compatible

## Customization

### Adding New Detection Patterns

Edit `src/content/content.js` to add new patterns for detecting TOS/Privacy links:

```javascript
const textPatterns = [
  /your-new-pattern/i,
  // existing patterns...
];
```

### Styling

- Popup styles: `src/popup/popup.css`
- Options styles: `src/options/options.css`
- Content script styles: Injected via JavaScript

### API Configuration

Update `src/utils/dataModels.js` to modify:
- API endpoints
- Data structures
- Error handling
- Retry logic

## Build Process

The webpack configuration:
- Bundles React components
- Copies static assets (manifest, icons, HTML)
- Supports both development and production modes
- Generates separate bundles for popup, options, content, and background scripts

## Browser Compatibility

- Chrome 88+
- Chromium-based browsers
- Uses Manifest v3 specification