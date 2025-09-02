// src/utils/dataModels.js
// This file is for use in popup and options pages only
// Background script has its own inline implementation

// Website data structure
export const WebsiteData = {
  domain: "",
  name: "",
  favicon_url: "",
  tos_url: "",
  privacy_policy_url: "",
  last_crawled_at: "",
  is_active: true,
};

// Extension session data structure
export const SessionData = {
  session_token: "",
  browser_fingerprint: "",
  user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  ip_address: "",
  extension_version: "",
  is_active: true,
  last_activity: new Date().toISOString(),
};

// Authentication data structure
export const AuthData = {
  auth_token: "",
  user_id: "",
  expires_at: "",
  is_authenticated: false,
  last_check: "",
};

// API Service for popup and options pages
export class APIService {
  constructor(baseURL, authURL) {
    this.baseURL = baseURL || "http://localhost:4000/api/extension"; // Replace with your API URL
    this.authURL = authURL || "http://localhost:4000"; // Authentication server URL
  }

  // Authentication methods
  async checkAuthentication() {
    const authData = await this.getAuthData();

    if (!authData.auth_token) {
      return { authenticated: false, reason: "no_token" };
    }

    // Check if token is expired
    if (authData.expires_at && new Date(authData.expires_at) < new Date()) {
      await this.clearAuthData();
      return { authenticated: false, reason: "token_expired" };
    }

    try {
      const response = await fetch(`${this.authURL}/api/is_authenticated`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authData.auth_token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.authenticated) {
          // Update last check timestamp
          await this.updateAuthData({ last_check: new Date().toISOString() });
          return { authenticated: true, user: result.user };
        } else {
          await this.clearAuthData();
          return { authenticated: false, reason: "invalid_token" };
        }
      } else {
        await this.clearAuthData();
        return { authenticated: false, reason: "server_error" };
      }
    } catch (error) {
      console.error("Authentication check failed:", error);
      return { authenticated: false, reason: "network_error" };
    }
  }

  async getAuthData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["authData"], (result) => {
        resolve(result.authData || { ...AuthData });
      });
    });
  }

  async setAuthData(authData) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ authData }, resolve);
    });
  }

  async updateAuthData(updates) {
    const currentAuth = await this.getAuthData();
    const updatedAuth = { ...currentAuth, ...updates };
    await this.setAuthData(updatedAuth);
    return updatedAuth;
  }

  async clearAuthData() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(["authData"], resolve);
    });
  }

  async redirectToLogin() {
    chrome.tabs.create({ url: `${this.authURL}/login_user` });
  }

  async handleAuthCallback(token, userId, expiresAt) {
    const authData = {
      auth_token: token,
      user_id: userId,
      expires_at: expiresAt,
      is_authenticated: true,
      last_check: new Date().toISOString(),
    };

    await this.setAuthData(authData);
    return authData;
  }

  // Generate browser fingerprint
  generateBrowserFingerprint() {
    if (typeof document === "undefined") {
      // Fallback for environments without document
      const fingerprint = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      return btoa(JSON.stringify(fingerprint));
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("Browser fingerprint", 2, 2);

    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
      canvas: canvas.toDataURL(),
    };

    return btoa(JSON.stringify(fingerprint));
  }

  // Generate or retrieve session token
  async getSessionToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["sessionToken"], (result) => {
        if (result.sessionToken) {
          resolve(result.sessionToken);
        } else {
          const newToken = this.generateSessionToken();
          chrome.storage.local.set({ sessionToken: newToken });
          resolve(newToken);
        }
      });
    });
  }

  generateSessionToken() {
    return (
      "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    );
  }

  // Get extension version
  getExtensionVersion() {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      return chrome.runtime.getManifest().version;
    }
    return "1.0.0";
  }

  // API calls with authentication
  async makeAuthenticatedRequest(endpoint, options = {}) {
    const authData = await this.getAuthData();

    if (!authData.auth_token) {
      throw new Error("Not authenticated");
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authData.auth_token}`,
      ...options.headers,
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired or invalid
      await this.clearAuthData();
      throw new Error("Authentication expired");
    }

    return response;
  }

  async sendWebsiteData(websiteData) {
    try {
      const response = await this.makeAuthenticatedRequest("/websites", {
        method: "POST",
        body: JSON.stringify(websiteData),
      });
      return await response.json();
    } catch (error) {
      console.error("Error sending website data:", error);
      throw error;
    }
  }

  async sendSessionData(sessionData) {
    try {
      const response = await this.makeAuthenticatedRequest("/sessions", {
        method: "POST",
        body: JSON.stringify(sessionData),
      });
      return await response.json();
    } catch (error) {
      console.error("Error sending session data:", error);
      throw error;
    }
  }

  async updateLastActivity() {
    const sessionToken = await this.getSessionToken();
    try {
      const response = await this.makeAuthenticatedRequest(
        `/sessions/${sessionToken}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            last_activity: new Date().toISOString(),
          }),
        }
      );
      return await response.json();
    } catch (error) {
      console.error("Error updating last activity:", error);
      throw error;
    }
  }

  async getWebsiteInfo(domain) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/websites/${domain}`
      );
      return await response.json();
    } catch (error) {
      console.error("Error fetching website info:", error);
      throw error;
    }
  }
}
