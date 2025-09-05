// src/background/background.js

// API Service class with enhanced session management
class APIService {
  constructor(baseURL, authURL) {
    this.baseURL = baseURL || "http://localhost:4000/api/extension";
    this.authURL = authURL || "http://localhost:4000";
    this.sessionValidationInterval = null;
    this.VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
    this.authCheckInProgress = false; // Lock to prevent concurrent auth checks
    this.authCheckQueue = []; // Queue for pending auth checks
  }

  // Enhanced authentication methods
  async checkAuthentication() {
    // Prevent concurrent authentication checks
    if (this.authCheckInProgress) {
      console.log("Auth check already in progress, waiting...");
      return new Promise((resolve) => {
        this.authCheckQueue.push(resolve);
      });
    }

    this.authCheckInProgress = true;
    console.log("=== checkAuthentication called ===");
    
    try {
      const result = await this._performAuthCheck();
      
      // Resolve all queued promises with the same result
      while (this.authCheckQueue.length > 0) {
        const resolve = this.authCheckQueue.shift();
        resolve(result);
      }
      
      return result;
    } finally {
      this.authCheckInProgress = false;
    }
  }

  async _performAuthCheck() {
    const authData = await this.getAuthData();
    console.log("checkAuthentication - starting with authData:", authData);

    // If we have a valid token that's not expired, we can skip the API call
    const hasToken = !!authData.auth_token;
    const hasExpiration = !!authData.expires_at;
    const isNotExpired = hasExpiration && new Date(authData.expires_at) > new Date();
    
    console.log("Token check - hasToken:", hasToken, "hasExpiration:", hasExpiration, "isNotExpired:", isNotExpired);
    console.log("Expiration date:", authData.expires_at, "Current date:", new Date().toISOString());
    
    if (hasToken && hasExpiration && isNotExpired) {
      console.log("Using cached authentication data");
      this.validateOrCreateBrowserSession()
      return { authenticated: true, user: authData.user_id };
    }

    // Only make API call if token is missing or expired
    if (!authData.auth_token || (authData.expires_at && new Date(authData.expires_at) <= new Date())) {
      console.log("Checking authentication with server");
      try {
        const response = await fetch(`${this.baseURL}/is_authenticated`, {
          method: "GET",
          credentials: 'include', // Include cookies for session-based authentication
          headers: {
            ...(authData.auth_token && { Authorization: `Bearer ${authData.auth_token}` }),
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const result = await response.json();
          console.log("Auth check result:", result);
          if (result.authenticated) {
            // If we don't have auth token data, fetch it from the server
            if (!authData.auth_token) {
              console.log("User authenticated but no token data, fetching auth data");
              try {
                const authDataResponse = await fetch(`${this.baseURL}/auth_data`, {
                  method: "GET",
                  credentials: 'include', // This will include cookies for session-based auth
                  headers: {
                    "Content-Type": "application/json",
                  },
                });
                
                if (authDataResponse.ok) {
                  const authDataResult = await authDataResponse.json();
                  console.log("Fetched auth data:", authDataResult);
                  // Server returns auth data directly (not wrapped in .data)
                  try {
                    await this.setAuthData({
                      auth_token: authDataResult.auth_token,
                      user_id: authDataResult.user_id,
                      expires_at: authDataResult.expires_at,
                      username: authDataResult.username,
                      is_authenticated: true,
                      last_check: new Date().toISOString()
                    });
                    console.log("Auth data successfully saved to storage");
                  } catch (error) {
                    console.error("Failed to save auth data:", error);
                    return { authenticated: false, reason: "storage_error" };
                  }
                  await this.validateOrCreateBrowserSession();
                  return { authenticated: true, user: result.user };
                } else {
                  console.error("Failed to fetch auth data:", authDataResponse.status);
                  return { authenticated: false, reason: "server_error" };
                }
              } catch (error) {
                console.error("Error fetching auth data:", error);
                return { authenticated: false, reason: "network_error" };
              }
            } else {
              // We have token data, just update last check
              await this.updateAuthData({ last_check: new Date().toISOString() });
              await this.validateOrCreateBrowserSession();
              return { authenticated: true, user: result.user };
            }
          } else {
            await this.clearAuthData();
            await this.clearSessionData();
            return { authenticated: false, reason: "invalid_token" };
          }
        } else {
          await this.clearAuthData();
          await this.clearSessionData();
          return { authenticated: false, reason: "server_error" };
        }
      } catch (error) {
        console.error("Authentication check failed:", error);
        return { authenticated: false, reason: "network_error" };
      }
    }

    // This should never be reached, but just in case
    return { authenticated: false, reason: "unknown" };
  }

  // Browser session management methods
  async validateOrCreateBrowserSession() {
    try {
      const sessionData = await this.getBrowserSessionData();
      
      const response = await this.makeAuthenticatedRequest("/sessions/validate", {
        method: "POST",
        body: JSON.stringify(sessionData),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Browser session validated/created:", result.session_token);
        if (response.authenticated) {
           await this.updateBrowserSessionData({
          authenticated: true,
          session_token: result.session_token,
          created_at: result.inserted_at,
          last_activity: result.last_activity,
          is_active: result.is_active,
          user_agent: result.user_agent,
          ip_address: result.ip_address,
          extension_version: result.extension_version,
          browser_fingerprint: result.browser_fingerprint,
        });
        
        return result.data;
        } else {
          // If not authenticated, clear session data
          await this.clearSessionData();
          this.clearAuthData();
          return null;
        }
        
        // Update local session data
       
      } else {
        console.error("Failed to validate browser session:", response.status);
        return null;
      }
    } catch (error) {
      console.error("Error validating browser session:", error);
      return null;
    }
  }

  async getBrowserSessionData() {
    const sessionToken = await this.getSessionToken();
    const sessionData = await this.getStoredSessionData();

    return {
      session_token: sessionToken,
      browser_fingerprint: this.generateBrowserFingerprint(),
      user_agent: navigator.userAgent,
      ip_address: await getPublicIP(),
      extension_version: chrome.runtime.getManifest().version,
      ...sessionData,
    };
  }

  async getStoredSessionData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["browserSessionData"], (result) => {
        resolve(result.browserSessionData || {});
      });
    });
  }

  async updateBrowserSessionData(updates) {
    const currentData = await this.getStoredSessionData();
    const updatedData = { ...currentData, ...updates };
    
    return new Promise((resolve) => {
      chrome.storage.local.set({ browserSessionData: updatedData }, resolve);
    });
  }

  async clearSessionData() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(["sessionToken", "browserSessionData"], resolve);
    });
  }

  // Enhanced activity tracking
  async updateLastActivity() {
    const sessionToken = await this.getSessionToken();
    try {
      const response = await this.makeAuthenticatedRequest(
        `/sessions/${sessionToken}/activity`,
        {
          method: "PATCH",
          body: JSON.stringify({
            last_activity: new Date().toISOString(),
          }),
        }
      );

      if (response.ok) {
        console.log("Activity updated successfully");
        await this.updateBrowserSessionData({
          last_activity_update: new Date().toISOString(),
        });
      }
      
      return await response.json();
    } catch (error) {
      console.error("Error updating last activity:", error);
      throw error;
    }
  }

  // Session validation scheduler
  startSessionValidation() {
    if (this.sessionValidationInterval) {
      clearInterval(this.sessionValidationInterval);
    }

    this.sessionValidationInterval = setInterval(async () => {
      const authStatus = await this.checkAuthentication();
      if (!authStatus.authenticated) {
        console.log("Session validation failed, stopping scheduler");
        this.stopSessionValidation();
      }
    }, this.VALIDATION_INTERVAL);
  }

  stopSessionValidation() {
    if (this.sessionValidationInterval) {
      clearInterval(this.sessionValidationInterval);
      this.sessionValidationInterval = null;
    }
  }

  // Session logout/cleanup
  async logout() {
    const sessionToken = await this.getSessionToken();
    
    try {
      // Deactivate session on server
      await this.makeAuthenticatedRequest(`/sessions/${sessionToken}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Error deactivating session:", error);
    }

    // Clear local data
    await this.clearAuthData();
    await this.clearSessionData();
    this.stopSessionValidation();
  }

  // Enhanced auth data methods
  async getAuthData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["authData"], (result) => {
        console.log("getAuthData - raw result from storage:", result);
        const authData = result.authData || {
          auth_token: "",
          user_id: "",
          expires_at: "",
          is_authenticated: false,
          last_check: "",
          username: "",
        };
        console.log("getAuthData - returning:", authData);
        resolve(authData);
      });
    });
  }

  async setAuthData(authData) {
    // When setting new auth data, also initialize session validation
    return new Promise((resolve, reject) => {
      console.log("About to save auth data:", authData);
      chrome.storage.local.set({ authData }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving auth data:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        console.log("Auth data saved successfully");
        
        // Verify it was saved by reading it back
        chrome.storage.local.get(["authData"], (result) => {
          console.log("Verification - saved auth data:", result.authData);
        });
        
        if (authData.auth_token) {
          this.startSessionValidation();
        }
        resolve();
      });
    });
  }

  async updateAuthData(updates) {
    const currentAuth = await this.getAuthData();
    const updatedAuth = { ...currentAuth, ...updates };
    await this.setAuthData(updatedAuth);
    return updatedAuth;
  }

  async clearAuthData() {
    this.stopSessionValidation();
    return new Promise((resolve) => {
      chrome.storage.local.remove(["authData"], resolve);
    });
  }

  async redirectToLogin() {
    chrome.tabs.create({ url: `${this.authURL}/users/log_in` });
  }

  // Generate browser fingerprint (service worker compatible)
  generateBrowserFingerprint() {
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      extensionId: chrome.runtime.id,
      // Note: screen object is not available in service workers
      // We'll use a fallback identifier instead
      serviceWorkerContext: true
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
      "ext_session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 12)
    );
  }

  // API calls with authentication
  async makeAuthenticatedRequest(endpoint, options = {}) {
    const authData = await this.getAuthData();

    if (!authData.auth_token) {
      console.log(authData.auth_token)
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
      await this.clearSessionData();
      throw new Error("Authentication expired");
    }

    return response;
  }

  // Your existing API methods...
  async sendWebsiteData(websiteData) {
    try {
      const response = await this.makeAuthenticatedRequest("/sites", {
        method: "POST",
        body: JSON.stringify(websiteData),
      });
      return await response.json();
    } catch (error) {
      console.error("Error sending website data:", error);
      throw error;
    }
  }

  async siteAvailable(domain) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/sites/${domain}/available`
      );
      return await response.json();
    } catch (error) {
      console.error("Error checking site availability:", error);
      throw error;
    }
  }

  async getWebsiteInfo(domain, websiteData = null) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/sites/${domain}`,
        {
          method: "POST",
          body: JSON.stringify(websiteData || { domain })
        }
      );
      return await response.json();
    } catch (error) {
      console.error("Error fetching website info:", error);
      throw error;
    }
  }

  // Get user's browser sessions
  async getUserSessions() {
    try {
      const response = await this.makeAuthenticatedRequest("/sessions");
      return await response.json();
    } catch (error) {
      console.error("Error fetching user sessions:", error);
      throw error;
    }
  }

  // Deactivate other sessions
  async deactivateOtherSessions() {
    const sessionToken = await this.getSessionToken();
    try {
      const response = await this.makeAuthenticatedRequest(
        `/sessions/${sessionToken}/deactivate_others`,
        { method: "POST" }
      );
      return await response.json();
    } catch (error) {
      console.error("Error deactivating other sessions:", error);
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
    console.log("User is authenticated, initializing session management");
    apiService.startSessionValidation();
  } else {
    console.log("User not authenticated, reason:", authStatus.reason);
  }
});

// Handle startup
chrome.runtime.onStartup.addListener(async () => {
  const authStatus = await apiService.checkAuthentication();
  
  if (authStatus.authenticated) {
    apiService.startSessionValidation();
  }
});

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
        .logout()
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "siteAvailable":
      apiService
        .checkAuthentication()
        .then((authStatus) => {
          if (!authStatus.authenticated) {
            sendResponse({ success: false, error: "Not authenticated" });
            return;
          }

          return apiService.siteAvailable(request.domain);
        })
        .then((data) => sendResponse({ success: true, data }))
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

          return apiService.getWebsiteInfo(request.domain, request.websiteData);
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

    case "getUserSessions":
      apiService
        .checkAuthentication()
        .then((authStatus) => {
          if (!authStatus.authenticated) {
            sendResponse({ success: false, error: "Not authenticated" });
            return;
          }

          return apiService.getUserSessions();
        })
        .then((sessions) => sendResponse({ success: true, data: sessions }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "deactivateOtherSessions":
      apiService
        .checkAuthentication()
        .then((authStatus) => {
          if (!authStatus.authenticated) {
            sendResponse({ success: false, error: "Not authenticated" });
            return;
          }

          return apiService.deactivateOtherSessions();
        })
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "validateBrowserSession":
      apiService
        .checkAuthentication()
        .then((authStatus) => {
          if (!authStatus.authenticated) {
            sendResponse({ success: false, error: "Not authenticated" });
            return;
          }

          return apiService.validateOrCreateBrowserSession();
        })
        .then((session) => sendResponse({ success: true, data: session }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "detectPolicy":
      // Handle policy detection notification for unauthenticated users
      handlePolicyDetection(request.domain, request.hasPolicy, sender.tab.id);
      sendResponse({ success: true });
      return false;

    case "getBrowserSessionInfo":
      apiService
        .getBrowserSessionData()
        .then((sessionData) => sendResponse({ success: true, data: sessionData }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

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

// Periodic cleanup of expired session validation
setInterval(() => {
  apiService.checkAuthentication().then((authStatus) => {
    if (!authStatus.authenticated) {
      apiService.stopSessionValidation();
    }
  });
}, 30 * 60 * 1000); // Check every 30 minutes

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