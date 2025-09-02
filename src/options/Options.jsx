// src/options/Options.jsx

import React, { useState, useEffect } from 'react';
import './options.css';

const Options = () => {
  const [settings, setSettings] = useState({
    apiUrl: 'http://localhost:3000/api',
    authUrl: 'http://localhost:4000',
    autoDetectPolicies: true,
    showNotifications: true,
    highlightPolicyLinks: true,
    trackingEnabled: true
  });
  const [authStatus, setAuthStatus] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isWelcome, setIsWelcome] = useState(false);

  useEffect(() => {
    loadSettings();
    loadSessionInfo();
    checkAuthStatus();
    
    // Check if this is a first-time welcome visit
    const urlParams = new URLSearchParams(window.location.search);
    setIsWelcome(urlParams.get('welcome') === 'true');
  }, []);

  const checkAuthStatus = () => {
    chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
      setAuthStatus(response);
    });
  };

  const loadSettings = () => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings({ ...settings, ...result.settings });
      }
      setLoading(false);
    });
  };

  const loadSessionInfo = () => {
    chrome.storage.local.get(['sessionToken', 'authData'], (result) => {
      const info = {};
      
      if (result.sessionToken) {
        info.sessionToken = result.sessionToken;
      }
      
      if (result.authData) {
        info.authData = result.authData;
      }
      
      info.extensionVersion = chrome.runtime.getManifest().version;
      info.userAgent = navigator.userAgent;
      info.lastActivity = new Date().toISOString();
      
      setSessionInfo(info);
    });
  };

  const saveSettings = () => {
    chrome.storage.sync.set({ settings }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleInputChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleLogin = () => {
    chrome.runtime.sendMessage({ action: 'redirectToLogin' });
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout? This will clear your authentication data.')) {
      chrome.runtime.sendMessage({ action: 'clearAuth' }, (response) => {
        if (response.success) {
          setAuthStatus({ authenticated: false });
          setSessionInfo(null);
          loadSessionInfo(); // Reload to get updated data
        }
      });
    }
  };

  const clearSessionData = () => {
    if (confirm('This will clear all session data. Continue?')) {
      chrome.storage.local.clear(() => {
        setSessionInfo(null);
        setAuthStatus({ authenticated: false });
        loadSessionInfo();
      });
    }
  };

  const exportData = async () => {
    if (!authStatus?.authenticated) {
      alert('Please login first to export your data.');
      return;
    }

    try {
      const response = await fetch(`${settings.apiUrl}/export`, {
        headers: {
          'Authorization': `Bearer ${sessionInfo?.authData?.auth_token}`
        }
      });
      const data = await response.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tos-privacy-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed: ' + error.message);
    }
  };

  if (loading) {
    return <div className="loading">Loading settings...</div>;
  }

  return (
    <div className="options-container">
      <header className="options-header">
        <h1>TOS & Privacy Policy Manager</h1>
        <p>Configure your extension settings</p>
        {authStatus?.authenticated && (
          <div className="auth-status">
            <span className="auth-badge">✓ Authenticated</span>
          </div>
        )}
      </header>

      <div className="options-content">
        {/* Welcome Section for New Users */}
        {(isWelcome || (!authStatus?.authenticated && !sessionInfo?.authData?.auth_token)) && (
          <section className="welcome-section">
            <h2>🎉 Welcome to TOS & Privacy Manager!</h2>
            <div className="welcome-content">
              <p>This extension helps you track and manage terms of service and privacy policies across the web.</p>
              
              <div className="feature-list">
                <div className="feature-item">
                  <span className="feature-icon">🔍</span>
                  <div>
                    <strong>Auto-Detection</strong>
                    <p>Automatically finds TOS and privacy policy links on websites</p>
                  </div>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">📊</span>
                  <div>
                    <strong>Tracking & Analytics</strong>
                    <p>Keep track of which sites you've agreed to terms with</p>
                  </div>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🔒</span>
                  <div>
                    <strong>Privacy Focused</strong>
                    <p>Your data is securely managed and you control what's collected</p>
                  </div>
                </div>
              </div>

              <div className="welcome-actions">
                <button className="primary-btn" onClick={handleLogin}>
                  Login to Get Started
                </button>
                <p className="welcome-note">
                  You'll be redirected to our secure login page to create an account or sign in.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Authentication Status */}
        <section className="settings-section">
          <h2>Authentication Status</h2>
          <div className="auth-section">
            {authStatus?.authenticated ? (
              <div className="auth-success">
                <div className="status-item">
                  <span className="status-indicator status-active"></span>
                  <strong>Authenticated</strong>
                </div>
                {authStatus.user && (
                  <div className="user-details">
                    <p><strong>User:</strong> {authStatus.user.email || authStatus.user.username || 'User'}</p>
                    {sessionInfo?.authData?.last_check && (
                      <p><strong>Last Verified:</strong> {new Date(sessionInfo.authData.last_check).toLocaleString()}</p>
                    )}
                  </div>
                )}
                <button className="logout-btn" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            ) : (
              <div className="auth-required">
                <div className="status-item">
                  <span className="status-indicator status-inactive"></span>
                  <strong>Not Authenticated</strong>
                </div>
                <p className="auth-message">
                  {authStatus?.reason === 'no_token' ? 'Please login to start using the extension.' :
                   authStatus?.reason === 'token_expired' ? 'Your session has expired. Please login again.' :
                   authStatus?.reason === 'invalid_token' ? 'Your session is invalid. Please login again.' :
                   'Authentication is required to use this extension.'}
                </p>
                <button className="login-btn" onClick={handleLogin}>
                  Login Now
                </button>
              </div>
            )}
          </div>
        </section>

        {/* API Configuration */}
        <section className="settings-section">
          <h2>API Configuration</h2>
          <div className="setting-item">
            <label htmlFor="apiUrl">API Base URL:</label>
            <input
              id="apiUrl"
              type="url"
              value={settings.apiUrl}
              onChange={(e) => handleInputChange('apiUrl', e.target.value)}
              placeholder="https://your-api.com/api"
            />
          </div>
          <div className="setting-item">
            <label htmlFor="authUrl">Authentication Server URL:</label>
            <input
              id="authUrl"
              type="url"
              value={settings.authUrl}
              onChange={(e) => handleInputChange('authUrl', e.target.value)}
              placeholder="https://your-auth-server.com"
            />
          </div>
        </section>

        {/* Detection Settings - Only show if authenticated */}
        {authStatus?.authenticated && (
          <>
            <section className="settings-section">
              <h2>Detection Settings</h2>
              <div className="setting-item checkbox-item">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.autoDetectPolicies}
                    onChange={(e) => handleInputChange('autoDetectPolicies', e.target.checked)}
                  />
                  Automatically detect TOS and Privacy Policy links
                </label>
              </div>
              <div className="setting-item checkbox-item">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.highlightPolicyLinks}
                    onChange={(e) => handleInputChange('highlightPolicyLinks', e.target.checked)}
                  />
                  Highlight detected policy links on pages
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h2>Notifications</h2>
              <div className="setting-item checkbox-item">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.showNotifications}
                    onChange={(e) => handleInputChange('showNotifications', e.target.checked)}
                  />
                  Show notifications when policies are detected
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h2>Privacy Settings</h2>
              <div className="setting-item checkbox-item">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.trackingEnabled}
                    onChange={(e) => handleInputChange('trackingEnabled', e.target.checked)}
                  />
                  Enable usage tracking (helps improve the extension)
                </label>
              </div>
            </section>
          </>
        )}

        {/* Session Information - Only show if authenticated */}
        {authStatus?.authenticated && sessionInfo && (
          <section className="settings-section">
            <h2>Session Information</h2>
            <div className="session-info">
              {sessionInfo.sessionToken && (
                <div className="info-item">
                  <strong>Session Token:</strong> {sessionInfo.sessionToken}
                </div>
              )}
              {sessionInfo.authData?.auth_token && (
                <div className="info-item">
                  <strong>Auth Token:</strong> {sessionInfo.authData.auth_token.substring(0, 20)}...
                </div>
              )}
              <div className="info-item">
                <strong>Extension Version:</strong> {sessionInfo.extensionVersion}
              </div>
              <div className="info-item">
                <strong>Last Activity:</strong> {new Date(sessionInfo.lastActivity).toLocaleString()}
              </div>
            </div>
          </section>
        )}

        {/* Data Management - Only show if authenticated */}
        {authStatus?.authenticated && (
          <section className="settings-section">
            <h2>Data Management</h2>
            <div className="action-buttons">
              <button className="export-btn" onClick={exportData}>
                Export Data
              </button>
              <button className="clear-btn" onClick={clearSessionData}>
                Clear Session Data
              </button>
            </div>
          </section>
        )}

        <div className="save-section">
          <button 
            className={`save-btn ${saved ? 'saved' : ''}`}
            onClick={saveSettings}
          >
            {saved ? 'Settings Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Options;