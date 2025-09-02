// src/background/background.js

// API Service class (inline since imports don't work in service workers)
class APIService {
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
        resolve(
          result.authData || {
            auth_token: "",
            user_id: "",
            expires_at: "",
            is_authenticated: false,
            last_check: "",
          }
        );
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

  // Generate browser fingerprint
  generateBrowserFingerprint() {
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

const apiService = new APIService();

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log("TOS & Privacy Manager extension installed");

  // Check authentication on install
  const authStatus = await apiService.checkAuthentication();

  if (authStatus.authenticated) {
    console.log("User is authenticated, initializing session data");
    await initializeSessionData();
  } else {
    console.log("User not authenticated, reason:", authStatus.reason);
    // Don't initialize session data for unauthenticated users
  }
});

async function initializeSessionData() {
  // Initialize session data
  const sessionData = {
    session_token: await apiService.getSessionToken(),
    browser_fingerprint: apiService.generateBrowserFingerprint(),
    user_agent: navigator.userAgent,
    ip_address: await getPublicIP(),
    extension_version: chrome.runtime.getManifest().version,
    is_active: true,
    last_activity: new Date().toISOString(),
  };

  // Send initial session data to API
  try {
    await apiService.sendSessionData(sessionData);
    console.log("Session data initialized");
  } catch (error) {
    console.error("Failed to initialize session:", error);
  }
}

// Handle tab updates with authentication check
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    !tab.url.startsWith("chrome://")
  ) {
    // Check authentication before processing
    const authStatus = await apiService.checkAuthentication();

    if (!authStatus.authenticated) {
      console.log("User not authenticated, skipping data collection");
      return;
    }

    try {
      const url = new URL(tab.url);
      const domain = url.hostname;

      // Update last activity
      await apiService.updateLastActivity();

      // Get website data from content script
      chrome.tabs.sendMessage(
        tabId,
        { action: "getWebsiteData" },
        (response) => {
          if (response && response.websiteData) {
            // Check if TOS or Privacy Policy detected
            const hasPolicy =
              response.websiteData.tos_url ||
              response.websiteData.privacy_policy_url;

            if (hasPolicy) {
              // Send website data to API for authenticated users
              apiService
                .sendWebsiteData({
                  ...response.websiteData,
                  domain: domain,
                  last_crawled_at: new Date().toISOString(),
                })
                .catch((error) => {
                  console.error("Failed to send website data:", error);
                });
            }
          }
        }
      );
    } catch (error) {
      console.error("Error processing tab update:", error);
    }
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "checkAuth":
      apiService
        .checkAuthentication()
        .then((authStatus) => sendResponse(authStatus))
        .catch((error) =>
          sendResponse({ authenticated: false, error: error.message })
        );
      return true;

    case "redirectToLogin":
      apiService.redirectToLogin();
      sendResponse({ success: true });
      return false;

    case "setAuthData":
      apiService
        .setAuthData(request.authData)
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "clearAuth":
      apiService
        .clearAuthData()
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "getWebsiteInfo":
      apiService
        .checkAuthentication()
        .then((authStatus) => {
          if (!authStatus.authenticated) {
            sendResponse({ success: false, error: "Not authenticated" });
            return;
          }

          return apiService.getWebsiteInfo(request.domain);
        })
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "updateActivity":
      apiService
        .checkAuthentication()
        .then((authStatus) => {
          if (!authStatus.authenticated) {
            sendResponse({ success: false, error: "Not authenticated" });
            return;
          }

          return apiService.updateLastActivity();
        })
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "detectPolicy":
      // Handle policy detection notification for unauthenticated users
      handlePolicyDetection(request.domain, request.hasPolicy, sender.tab.id);
      sendResponse({ success: true });
      return false;

    default:
      sendResponse({ success: false, error: "Unknown action" });
  }
});

// Handle policy detection for unauthenticated users
async function handlePolicyDetection(domain, hasPolicy, tabId) {
  if (!hasPolicy) return;

  const authStatus = await apiService.checkAuthentication();

  if (!authStatus.authenticated) {
    // Show notification or badge for unauthenticated users
    chrome.action.setBadgeText({ text: "!", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#ff4444" });

    // Optionally show a notification
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "TOS & Privacy Policy Detected",
      message: `Terms of service or privacy policy detected on ${domain}. Login to track and manage this information.`,
    });
  } else {
    // Clear badge for authenticated users
    chrome.action.setBadgeText({ text: "", tabId });
  }
}

// Utility function to get public IP
async function getPublicIP() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error("Failed to get public IP:", error);
    return "unknown";
  }
}
