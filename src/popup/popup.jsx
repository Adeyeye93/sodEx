// src/popup/Popup.jsx

import React, { useState, useEffect } from 'react';
import './popup.css';

const Popup = () => {
  const [currentSite, setCurrentSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [isFirstTime, setIsFirstTime] = useState(false);
  
  // Session management state
  const [sessionInfo, setSessionInfo] = useState(null);
  const [allSessions, setAllSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('site'); // 'site' or 'sessions'

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  const checkAuthAndLoadData = async () => {
    try {
      // Check authentication first
      chrome.runtime.sendMessage({ action: 'checkAuth' }, async (authResponse) => {
        setAuthStatus(authResponse);
        
        if (!authResponse.authenticated) {
          // Check if this is a first-time user
          const authData = await getStoredAuthData();
          setIsFirstTime(!authData.auth_token);
          setLoading(false);
          return;
        }

        // User is authenticated, load both site data and session info
        await Promise.all([
          loadCurrentSiteData(),
          loadSessionInfo()
        ]);
      });
    } catch (err) {
      setError('Failed to check authentication');
      setLoading(false);
    }
  };

  const getStoredAuthData = () => {
    return new Promise((resolve) => {
      chrome.storage.local.get(['authData'], (result) => {
        resolve(result.authData || {});
      });
    });
  };

  const loadCurrentSiteData = async () => {
    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url || tab.url.startsWith('chrome://')) {
        setError('Cannot access this page');
        return;
      }

      const url = new URL(tab.url);
      const domain = url.hostname;

      // First check if site data is available and fresh
      chrome.runtime.sendMessage(
        { action: 'siteAvailable', domain },
        async (availabilityResponse) => {
          if (availabilityResponse.success && availabilityResponse.data) {
            const siteData = availabilityResponse.data;
            const isDataFresh = isLastCrawledFresh(siteData.last_crawled_at);
            
            if (isDataFresh) {
              // Data is fresh, use it directly
              console.log('Using fresh cached site data');
              setCurrentSite(siteData);
              return;
            } else {
              // Data exists but is stale, update it
              console.log('Site data is stale, refreshing...');
              await refreshSiteData(domain, url);
              return;
            }
          } else {
            // No data exists, fetch fresh data
            console.log('No site data found, fetching...');
            await refreshSiteData(domain, url);
          }
        }
      );
    } catch (err) {
      setError('Failed to load site data');
    }
  };

  const refreshSiteData = async (domain, url) => {
    try {
      // First get current tab to collect website data from content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Get website data from content script
      chrome.tabs.sendMessage(tab.id, { action: 'getWebsiteData' }, (contentResponse) => {
        const websiteData = contentResponse?.websiteData || {
          domain,
          name: domain,
          favicon_url: `${url.protocol}//${domain}/favicon.ico`,
          tos_url: '',
          privacy_policy_url: '',
          is_active: true,
          last_crawled_at: new Date().toISOString()
        };

        // Call getWebsiteInfo with the collected website data
        chrome.runtime.sendMessage(
          { 
            action: 'getWebsiteInfo', 
            domain, 
            websiteData: {
              ...websiteData,
              domain,
              last_crawled_at: new Date().toISOString()
            }
          },
          (response) => {
            if (response.success) {
              console.log('Successfully fetched/updated site data');
              setCurrentSite(response.data.site || response.data);
            } else {
              console.error('API call failed:', response.error);
              // If API call fails, use the collected data as fallback
              setCurrentSite(websiteData);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error refreshing site data:', error);
      // Fallback if content script fails
      const fallbackData = {
        domain,
        name: domain,
        favicon_url: `${url.protocol}//${domain}/favicon.ico`,
        tos_url: '',
        privacy_policy_url: '',
        is_active: true,
        last_crawled_at: null
      };
      setCurrentSite(fallbackData);
    }
  };

  const isLastCrawledFresh = (lastCrawledAt) => {
    if (!lastCrawledAt) return false;
    
    const crawledDate = new Date(lastCrawledAt);
    const now = new Date();
    const diffHours = (now - crawledDate) / (1000 * 60 * 60);
    
    // Consider data fresh if it's less than 24 hours old
    return diffHours < 24;
  };

  const loadSessionInfo = async () => {
    try {
      // Get current session info
      const sessionResponse = await sendMessage({ action: 'getBrowserSessionInfo' });
      if (sessionResponse.success) {
        setSessionInfo(sessionResponse.data);
      }
    } catch (err) {
      console.error('Failed to load session info:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllSessions = async () => {
    setSessionLoading(true);
    try {
      const response = await sendMessage({ action: 'getUserSessions' });
      if (response.success) {
        setAllSessions(response.data.data || []);
      } else {
        setError('Failed to load sessions');
      }
    } catch (err) {
      setError('Failed to load sessions');
    } finally {
      setSessionLoading(false);
    }
  };

  const refreshSession = async () => {
    setSessionLoading(true);
    try {
      await sendMessage({ action: 'validateBrowserSession' });
      await loadSessionInfo();
      setError(null);
      showSuccess('Session refreshed successfully');
    } catch (err) {
      setError('Failed to refresh session');
    } finally {
      setSessionLoading(false);
    }
  };

  const deactivateOtherSessions = async () => {
    setSessionLoading(true);
    try {
      const response = await sendMessage({ action: 'deactivateOtherSessions' });
      if (response.success) {
        await loadAllSessions();
        showSuccess('Other sessions deactivated');
      } else {
        setError('Failed to deactivate other sessions');
      }
    } catch (err) {
      setError('Failed to deactivate other sessions');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleLogin = () => {
    chrome.runtime.sendMessage({ action: 'redirectToLogin' });
    window.close();
  };

  const handleLogout = async () => {
    try {
      await sendMessage({ action: 'clearAuth' });
      setAuthStatus({ authenticated: false });
      setSessionInfo(null);
      setAllSessions([]);
    } catch (err) {
      setError('Failed to logout');
    }
  };

  const handleGetStarted = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };

  const openLink = (url) => {
    if (url) {
      chrome.tabs.create({ url });
    }
  };

  const refreshData = (forceFresh = false) => {
    setLoading(true);
    setError(null);
    if (forceFresh) {
      // Force fresh data fetch by directly calling refreshSiteData
      const getCurrentTab = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.url && !tab.url.startsWith('chrome://')) {
          const url = new URL(tab.url);
          await refreshSiteData(url.hostname, url);
        }
        setLoading(false);
      };
      getCurrentTab();
    } else {
      checkAuthAndLoadData();
    }
  };

  const sendMessage = (message) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response || {});
        }
      });
    });
  };

  const showSuccess = (message) => {
    setError(null);
    // You could implement a success state here
    console.log('Success:', message);
  };

  const extractBrowserInfo = (userAgent) => {
    if (!userAgent) return 'Unknown Browser';
    
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    
    return 'Unknown Browser';
  };

  const formatLastActivity = (timestamp) => {
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
    return `${diffDays}d ago`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  // Authentication required state
  if (!authStatus?.authenticated) {
    return (
      <div className="popup-container">
        <div className="auth-required">
          <div className="auth-header">
            <h1>🔒 Authentication Required</h1>
            {isFirstTime ? (
              <p>Welcome! Please login to start managing terms of service and privacy policies.</p>
            ) : (
              <p>Your session has expired. Please login to continue.</p>
            )}
          </div>

          {currentSite && (currentSite.tos_url || currentSite.privacy_policy_url) && (
            <div className="policy-detected">
              <div className="detection-notice">
                <span className="icon">📋</span>
                <div>
                  <strong>Policy Documents Detected!</strong>
                  <p>This website has terms of service or privacy policy. Login to track and manage this information.</p>
                </div>
              </div>
            </div>
          )}

          <div className="auth-actions">
            <button className="login-btn" onClick={handleLogin}>
              Login to Continue
            </button>
            {isFirstTime && (
              <button className="welcome-btn" onClick={handleGetStarted}>
                Learn More
              </button>
            )}
          </div>

          <div className="auth-info">
            <small>
              Reason: {authStatus?.reason === 'no_token' ? 'Not logged in' : 
                      authStatus?.reason === 'token_expired' ? 'Session expired' :
                      authStatus?.reason === 'invalid_token' ? 'Invalid session' :
                      'Authentication error'}
            </small>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !authStatus.authenticated) {
    return (
      <div className="popup-container">
        <div className="error">{error}</div>
        <button className="retry-btn" onClick={refreshData}>
          Try Again
        </button>
      </div>
    );
  }

  // Authenticated user interface
  return (
    <div className="popup-container">
      <header className="popup-header">
        <img 
          src={currentSite?.favicon_url} 
          alt="Site favicon" 
          className="site-favicon"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        <div className="site-info">
          <h1 className="site-name">{currentSite?.name || currentSite?.domain}</h1>
          <p className="site-domain">{currentSite?.domain}</p>
        </div>
        <div className="auth-indicator">
          <div className="session-status">
            <span className="auth-badge">✓</span>
            <span className="session-indicator" title="Session Active">
              {sessionInfo ? '🔗' : '⚠️'}
            </span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'site' ? 'active' : ''}`}
          onClick={() => setActiveTab('site')}
        >
          📋 Site Info
        </button>
        <button 
          className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('sessions');
            if (allSessions.length === 0 && !sessionLoading) {
              loadAllSessions();
            }
          }}
        >
          🔐 Sessions
        </button>
      </div>

      <div className="popup-content">
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Site Information Tab */}
        {activeTab === 'site' && (
          <div className="site-tab">
            <div className="policy-section">
              <h2>Policy Documents</h2>
              
              <div className="policy-item">
                <span className="policy-label">Terms of Service:</span>
                {currentSite?.tos_url ? (
                  <button 
                    className="policy-link"
                    onClick={() => openLink(currentSite.tos_url)}
                  >
                    View TOS
                  </button>
                ) : (
                  <span className="policy-missing">Not detected</span>
                )}
              </div>

              <div className="policy-item">
                <span className="policy-label">Privacy Policy:</span>
                {currentSite?.privacy_policy_url ? (
                  <button 
                    className="policy-link"
                    onClick={() => openLink(currentSite.privacy_policy_url)}
                  >
                    View Privacy Policy
                  </button>
                ) : (
                  <span className="policy-missing">Not detected</span>
                )}
              </div>

              {(currentSite?.tos_url || currentSite?.privacy_policy_url) && (
                <div className="tracking-status">
                  <span className="status-indicator status-active"></span>
                  <small>Tracking enabled for this site</small>
                </div>
              )}
            </div>

            <div className="actions-section">
              <button className="refresh-btn" onClick={() => refreshData(false)}>
                Refresh Data
              </button>
              {currentSite?.last_crawled_at && (
                <button className="force-refresh-btn" onClick={() => refreshData(true)}>
                  Force Update
                </button>
              )}
              <button 
                className="options-btn"
                onClick={() => chrome.runtime.openOptionsPage()}
              >
                Settings
              </button>
            </div>

            {currentSite?.last_crawled_at && (
              <div className="metadata">
                <small>
                  Last updated: {new Date(currentSite.last_crawled_at).toLocaleDateString()}
                  {isLastCrawledFresh(currentSite.last_crawled_at) ? (
                    <span className="fresh-indicator"> • Fresh</span>
                  ) : (
                    <span className="stale-indicator"> • Needs update</span>
                  )}
                </small>
              </div>
            )}
          </div>
        )}

        {/* Session Management Tab */}
        {activeTab === 'sessions' && (
          <div className="sessions-tab">
            {/* Current Session Info */}
            {sessionInfo && (
              <div className="current-session">
                <h3>Current Session</h3>
                <div className="session-details">
                  <div className="session-field">
                    <span className="field-label">Session ID:</span>
                    <span className="field-value">
                      {sessionInfo.session_token?.substring(0, 20)}...
                    </span>
                  </div>
                  <div className="session-field">
                    <span className="field-label">Last Activity:</span>
                    <span className="field-value">
                      {formatLastActivity(sessionInfo.last_activity_update)}
                    </span>
                  </div>
                  <div className="session-field">
                    <span className="field-label">Extension Version:</span>
                    <span className="field-value">
                      {sessionInfo.extension_version || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Session Actions */}
            <div className="session-actions">
              <button 
                className="session-btn refresh-session"
                onClick={refreshSession}
                disabled={sessionLoading}
              >
                {sessionLoading ? 'Refreshing...' : 'Refresh Session'}
              </button>
              
              <button 
                className="session-btn load-sessions"
                onClick={loadAllSessions}
                disabled={sessionLoading}
              >
                {sessionLoading ? 'Loading...' : 'Load All Sessions'}
              </button>
              
              {allSessions.length > 1 && (
                <button 
                  className="session-btn deactivate-others"
                  onClick={deactivateOtherSessions}
                  disabled={sessionLoading}
                >
                  Deactivate Other Sessions
                </button>
              )}
            </div>

            {/* All Sessions List */}
            {allSessions.length > 0 && (
              <div className="all-sessions">
                <h3>All Active Sessions ({allSessions.length})</h3>
                <div className="sessions-list">
                  {allSessions.map((session, index) => {
                    const isCurrent = session.session_token === sessionInfo?.session_token;
                    const browserInfo = extractBrowserInfo(session.user_agent);
                    
                    return (
                      <div 
                        key={session.id || index} 
                        className={`session-item ${isCurrent ? 'current-session' : ''}`}
                      >
                        <div className="session-item-header">
                          <span className="browser-info">{browserInfo}</span>
                          {isCurrent && <span className="current-badge">CURRENT</span>}
                        </div>
                        <div className="session-item-details">
                          <div className="session-detail">
                            <span>IP: {session.ip_address || 'Unknown'}</span>
                          </div>
                          <div className="session-detail">
                            <span>Last Activity: {formatLastActivity(session.last_activity)}</span>
                          </div>
                          <div className="session-detail">
                            <span>Version: {session.extension_version || 'Unknown'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Logout Section */}
            <div className="logout-section">
              <button className="logout-btn" onClick={handleLogout}>
                Logout & End Session
              </button>
            </div>
          </div>
        )}

        {/* User Info Footer */}
        <div className="user-info">
          <small>
            Logged in as: {authStatus?.user?.email || 'User'}
            {sessionInfo && (
              <span className="session-info">
                {' • Session: ' + formatLastActivity(sessionInfo.last_activity_update)}
              </span>
            )}
          </small>
        </div>
      </div>
    </div>
  );
};

export default Popup;