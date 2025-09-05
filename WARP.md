# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a Chrome browser extension built with React and Webpack that helps users manage terms of service and privacy policies. The extension automatically detects TOS/Privacy Policy links on websites, tracks user sessions, and integrates with a backend API for data management and user authentication.

## Development Commands

### Setup and Installation
```bash
npm install                 # Install all dependencies
```

### Build Commands
```bash
npm run build              # Build extension for production
npm run dev                # Build in development mode with watch
npm run clean              # Remove dist directory
```

### Development Workflow
```bash
npm run dev                # Start webpack in watch mode
# In another terminal, load unpacked extension from dist/ folder in Chrome
```

### Chrome Extension Loading
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist/` folder
4. Refresh the extension when making changes

## Core Architecture

### Extension Components

**Background Service Worker** (`src/background/background.js`):
- Handles authentication and session management
- Processes tab updates and website data collection
- Manages API communication with backend
- Implements periodic session validation
- Handles notifications and badge updates

**Content Script** (`src/content/content.js`):
- Injects into all web pages
- Auto-detects TOS and Privacy Policy links
- Extracts website metadata (title, favicon, etc.)
- Communicates with background script

**Popup UI** (`src/popup/`):
- React-based popup interface
- Shows current site's policy information
- Displays authentication status
- Provides quick actions for users

**Options Page** (`src/options/`):
- React-based configuration interface
- User data management and export
- Session management controls
- Authentication settings

### Data Models

**Website Data Structure**:
- Domain, name, favicon URL
- TOS URL and Privacy Policy URL detection
- Last crawled timestamp and active status

**Session Data Structure**:
- Unique session tokens and browser fingerprinting
- User agent, IP address, extension version tracking
- Activity timestamps and authentication state

**Authentication Data**:
- JWT tokens with expiration handling
- User ID and authentication status
- Automatic token refresh and cleanup

### API Integration

**Expected Backend Endpoints**:
```javascript
POST /api/extension/websites        // Create/update website data
POST /api/extension/sessions/validate // Validate browser session
PATCH /api/extension/sessions/:id/activity // Update activity
GET /api/extension/websites/:domain  // Get website information
GET /api/extension/is_authenticated  // Check auth status
```

**Authentication Flow**:
- Bearer token authentication via Authorization header
- Automatic session validation and renewal
- Graceful handling of expired tokens
- Redirect to login page when unauthenticated

### Key Design Patterns

**Session Management**:
- Browser fingerprinting for session identification
- Periodic validation with backend API
- Local storage for session persistence
- Automatic cleanup on logout/expiration

**Policy Detection**:
- Multiple detection strategies for TOS/Privacy links
- Text pattern matching and URL analysis
- Metadata extraction from page headers
- Fallback mechanisms for edge cases

**Error Handling**:
- Network error resilience
- Authentication failure recovery
- Graceful degradation for unauthenticated users
- User notification system

## Development Notes

### Build System
- **Webpack Configuration**: Multi-entry bundling for different extension components
- **Babel Transpilation**: ES6+ support with React JSX transformation
- **Chrome Compatibility**: Targets Chrome 88+ with Manifest v3
- **Asset Management**: Automatic copying of manifest, icons, and HTML files

### React Integration
- Uses React 18 with automatic JSX runtime
- Separate bundles for popup and options pages
- CSS modules with style-loader for component styling
- Chrome Storage API integration instead of localStorage

### Chrome Extension APIs
- **Storage API**: For persistent data across extension components
- **Tabs API**: For website monitoring and data collection
- **Notifications API**: For user alerts about policy detection
- **Scripting API**: For content script injection and communication

### Security Considerations
- Content Security Policy compliance
- Secure token storage in Chrome Storage API
- Browser fingerprinting for session security
- HTTPS-only API communication

### Backend Integration
- Configurable API base URLs in `src/utils/dataModels.js`
- Default localhost development server (port 4000)
- Session-based authentication with JWT tokens
- Automatic retry logic for failed API requests

## Application Structure

### Source Directory Layout
```
src/
├── background/           # Background service worker
├── content/             # Content scripts for web pages
├── popup/              # React popup interface
├── options/            # React options page
├── utils/              # Shared utilities and API service
├── icons/              # Extension icons (16x16 to 128x128)
└── manifest.json       # Chrome extension manifest
```

### Key Configuration Files
- `webpack.config.js` - Build configuration and entry points
- `babel.config.json` - JavaScript/React transpilation settings
- `package.json` - Dependencies and build scripts
- `src/manifest.json` - Chrome extension permissions and metadata

### Extension Permissions
- `storage` - Local data persistence
- `activeTab` - Current tab access
- `scripting` - Content script injection
- `tabs` - Tab monitoring and updates
- `notifications` - User alerts
- `host_permissions` - All websites access for policy detection
