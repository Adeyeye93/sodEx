// src/popup/Popup.jsx

import React, { useState, useEffect } from 'react';
import './popup.css';

const Popup = () => {
  const [currentSite, setCurrentSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCurrentSiteData();
  }, []);

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
            console.log("message sent") 
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

  const openLink = (url) => {
    if (url) {
      chrome.tabs.create({ url });
    }
  };

  const refreshData = () => {
    setLoading(true);
    setError(null);
    loadCurrentSiteData();
  };

  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="popup-container">
        <div className="error">{error}</div>
      </div>
    );
  }

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
      </div>
    </div>
  );
};

export default Popup;