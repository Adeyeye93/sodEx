// src/popup/Popup.jsx

import React, { useState, useEffect } from 'react';
import './popup.css';

const Popup = () => {
  const [currentSite, setCurrentSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [isFirstTime, setIsFirstTime] = useState(false);

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

        // User is authenticated, load site data
        await loadCurrentSiteData();
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
        setLoading(false);
        return;
      }

      const url = new URL(tab.url);
      const domain = url.hostname;

      // Get website data from API
      chrome.runtime.sendMessage(
        { action: 'getWebsiteInfo', domain },
        (response) => {
          if (response.success) {
            setCurrentSite(response.data);
          } else {
            // If no data exists, create placeholder
            setCurrentSite({
              domain,
              name: domain,
              favicon_url: `${url.protocol}//${domain}/favicon.ico`,
              tos_url: '',
              privacy_policy_url: '',
              is_active: true,
              last_crawled_at: null
            });
          }
          setLoading(false);
        }
      );
    } catch (err) {
      setError('Failed to load site data');
      setLoading(false);
    }
  };

  const handleLogin = () => {
    chrome.runtime.sendMessage({ action: 'redirectToLogin' });
    window.close(); // Close popup after redirecting
  };

  const handleGetStarted = () => {
    // Open options page for welcome/onboarding
    chrome.runtime.openOptionsPage();
    window.close();
  };

  const openLink = (url) => {
    if (url) {
      chrome.tabs.create({ url });
    }
  };

  const refreshData = () => {
    setLoading(true);
    setError(null);
    checkAuthAndLoadData();
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
  if (error) {
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
          <span className="auth-badge">✓</span>
        </div>
      </header>

      <div className="popup-content">
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
          <button className="refresh-btn" onClick={refreshData}>
            Refresh Data
          </button>
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
            </small>
          </div>
        )}

        <div className="user-info">
          <small>
            Logged in as: {authStatus?.user?.email || 'User'}
          </small>
        </div>
      </div>
    </div>
  );
};

export default Popup;