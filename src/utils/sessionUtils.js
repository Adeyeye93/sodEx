// src/utils/sessionUtils.js

/**
 * Session management utilities for Chrome extension
 */

export class SessionManager {
  constructor() {
    this.listeners = new Set();
    this.currentSession = null;
    this.lastCheck = null;
    this.checkInterval = null;
  }

  /**
   * Initialize session manager with periodic checks
   */
  async init() {
    await this.loadSessionInfo();
    this.startPeriodicCheck();
    return this.currentSession;
  }

  /**
   * Load current session information
   */
  async loadSessionInfo() {
    try {
      const response = await this.sendMessage({ action: 'getBrowserSessionInfo' });
      if (response.success) {
        this.currentSession = response.data;
        this.lastCheck = new Date();
        this.notifyListeners('sessionLoaded', this.currentSession);
      }
      return this.currentSession;
    } catch (error) {
      console.error('Failed to load session info:', error);
      this.currentSession = null;
      return null;
    }
  }

  /**
   * Validate/refresh current session
   */
  async validateSession() {
    try {
      const response = await this.sendMessage({ action: 'validateBrowserSession' });
      if (response.success) {
        await this.loadSessionInfo();
        this.notifyListeners('sessionValidated', this.currentSession);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to validate session:', error);
      return false;
    }
  }

  /**
   * Get all user sessions
   */
  async getAllSessions() {
    try {
      const response = await this.sendMessage({ action: 'getUserSessions' });
      if (response.success) {
        const sessions = response.data.data || [];
        this.notifyListeners('allSessionsLoaded', sessions);
        return sessions;
      }
      return [];
    } catch (error) {
      console.error('Failed to get all sessions:', error);
      return [];
    }
  }

  /**
   * Deactivate other sessions
   */
  async deactivateOtherSessions() {
    try {
      const response = await this.sendMessage({ action: 'deactivateOtherSessions' });
      if (response.success) {
        this.notifyListeners('otherSessionsDeactivated', response.data);
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to deactivate other sessions:', error);
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateActivity() {
    try {
      const response = await this.sendMessage({ action: 'updateActivity' });
      if (response.success) {
        await this.loadSessionInfo();
        this.notifyListeners('activityUpdated', this.currentSession);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to update activity:', error);
      return false;
    }
  }

  /**
   * Start periodic session validation
   */
  startPeriodicCheck(intervalMs = 5 * 60 * 1000) { // 5 minutes
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      const authStatus = await this.sendMessage({ action: 'checkAuth' });
      
      if (authStatus.authenticated) {
        await this.loadSessionInfo();
      } else {
        this.currentSession = null;
        this.notifyListeners('sessionExpired', authStatus);
        this.stopPeriodicCheck();
      }
    }, intervalMs);
  }

  /**
   * Stop periodic session validation
   */
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Add event listener for session events
   */
  addEventListener(event, callback) {
    const listener = { event, callback };
    this.listeners.add(listener);
    
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      if (listener.event === event || listener.event === '*') {
        try {
          listener.callback(data, event);
        } catch (error) {
          console.error('Session listener error:', error);
        }
      }
    });
  }

  /**
   * Send message to background script
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response || {});
        }
      });
    });
  }

  /**
   * Get session display info
   */
  getSessionDisplayInfo(session) {
    if (!session) return null;

    return {
      id: session.id || 'unknown',
      shortToken: session.session_token?.substring(0, 20) + '...' || 'unknown',
      browser: this.extractBrowserInfo(session.user_agent),
      lastActivity: this.formatLastActivity(session.last_activity || session.last_activity_update),
      ipAddress: session.ip_address || 'unknown',
      version: session.extension_version || 'unknown',
      isActive: session.is_active !== false
    };
  }

  /**
   * Extract browser information from user agent
   */
  extractBrowserInfo(userAgent) {
    if (!userAgent) return 'Unknown Browser';
    
    const browsers = [
      { name: 'Chrome', pattern: /Chrome\/([0-9.]+)/ },
      { name: 'Firefox', pattern: /Firefox\/([0-9.]+)/ },
      { name: 'Safari', pattern: /Safari\/([0-9.]+)/ },
      { name: 'Edge', pattern: /Edge\/([0-9.]+)/ }
    ];

    for (const browser of browsers) {
      const match = userAgent.match(browser.pattern);
      if (match) {
        return `${browser.name} ${match[1]}`;
      }
    }
    
    return 'Unknown Browser';
  }

  /**
   * Format last activity timestamp
   */
  formatLastActivity(timestamp) {
    if (!timestamp) return 'Never';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopPeriodicCheck();
    this.listeners.clear();
    this.currentSession = null;
  }
}

// Hook for React components
export const useSessionManager = () => {
  const [sessionManager] = React.useState(() => new SessionManager());
  const [sessionData, setSessionData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const initSession = async () => {
      try {
        await sessionManager.init();
        setSessionData(sessionManager.currentSession);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    const removeListener = sessionManager.addEventListener('*', (data, event) => {
      switch (event) {
        case 'sessionLoaded':
        case 'sessionValidated':
        case 'activityUpdated':
          setSessionData(data);
          setError(null);
          break;
        case 'sessionExpired':
          setSessionData(null);
          setError('Session expired');
          break;
      }
    });

    initSession();

    return () => {
      removeListener();
      sessionManager.destroy();
    };
  }, [sessionManager]);

  const actions = React.useMemo(() => ({
    refresh: () => sessionManager.validateSession(),
    updateActivity: () => sessionManager.updateActivity(),
    getAllSessions: () => sessionManager.getAllSessions(),
    deactivateOthers: () => sessionManager.deactivateOtherSessions()
  }), [sessionManager]);

  return {
    sessionData,
    isLoading,
    error,
    sessionManager,
    ...actions
  };
};

// Export singleton instance for non-React usage
export const sessionManager = new SessionManager();

// Export utility functions
export const sessionUtils = {
  extractBrowserInfo: (userAgent) => sessionManager.extractBrowserInfo(userAgent),
  formatLastActivity: (timestamp) => sessionManager.formatLastActivity(timestamp),
  getDisplayInfo: (session) => sessionManager.getSessionDisplayInfo(session)
};

export default SessionManager;