// src/options/Options.jsx

import React, { useState, useEffect } from 'react';
import './options.css';

const Options = () => {
  const [settings, setSettings] = useState({
    apiUrl: 'http://localhost:3000/api',
    autoDetectPolicies: true,
    showNotifications: true,
    highlightPolicyLinks: true,
    trackingEnabled: true
  });
  const [sessionInfo, setSessionInfo] = useState(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
    loadSessionInfo();
  }, []);

  const loadSettings = () => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings({ ...settings, ...result.settings });
      }
      setLoading(false);
    });
  };

  const loadSessionInfo = () => {
    chrome.storage.local.get(['sessionToken'], (result) => {
      if (result.sessionToken) {
        setSessionInfo({
          sessionToken: result.sessionToken,
          extensionVersion: chrome.runtime.getManifest().version,
          userAgent: navigator.userAgent,
          lastActivity: new Date().toISOString()
        });
      }
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

  const clearSessionData = () => {
    if (confirm('This will clear all session data. Continue?')) {
      chrome.storage.local.clear(() => {
        setSessionInfo(null);
        // Generate new session
        window.location.reload();
      });
    }
  };

  const exportData = async () => {
    try {
      const response = await fetch(`${settings.apiUrl}/export`, {
        headers: {
          'Authorization': `Bearer ${sessionInfo?.sessionToken}`
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
      </header>

      <div className="options-content">
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
        </section>

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

        <section className="settings-section">
          <h2>Session Information</h2>
          {sessionInfo ? (
            <div className="session-info">
              <div className="info-item">
                <strong>Session Token:</strong> {sessionInfo.sessionToken}
              </div>
              <div className="info-item">
                <strong>Extension Version:</strong> {sessionInfo.extensionVersion}
              </div>
              <div className="info-item">
                <strong>Last Activity:</strong> {new Date(sessionInfo.lastActivity).toLocaleString()}
              </div>
            </div>
          ) : (
            <p>No session data available</p>
          )}
        </section>

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