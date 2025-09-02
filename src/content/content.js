// src/content/content.js

// Content script to extract website data
class WebsiteDataExtractor {
  constructor() {
    this.domain = window.location.hostname;
    this.init();
  }

  init() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getWebsiteData') {
        const websiteData = this.extractWebsiteData();
        sendResponse({ websiteData });
      }
    });

    // Auto-detect TOS and Privacy Policy links
    this.detectPolicyLinks();
  }

  extractWebsiteData() {
    const data = {
      domain: this.domain,
      name: this.getWebsiteName(),
      favicon_url: this.getFaviconUrl(),
      tos_url: this.findTOSLink(),
      privacy_policy_url: this.findPrivacyPolicyLink(),
      is_active: true
    };

    return data;
  }

  getWebsiteName() {
    // Try multiple methods to get website name
    const title = document.title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const siteName = document.querySelector('meta[property="og:site_name"]');
    
    if (siteName && siteName.content) return siteName.content;
    if (ogTitle && ogTitle.content) return ogTitle.content;
    if (title) return title;
    
    return this.domain;
  }

  getFaviconUrl() {
    const favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
    if (favicon && favicon.href) {
      return favicon.href;
    }
    return `${window.location.protocol}//${this.domain}/favicon.ico`;
  }

  findTOSLink() {
    const selectors = [
      'a[href*="terms"]',
      'a[href*="tos"]',
      'a[href*="conditions"]',
      'a[href*="service"]'
    ];

    const textPatterns = [
      /terms\s+of\s+(service|use)/i,
      /terms\s+&\s+conditions/i,
      /user\s+agreement/i,
      /^terms$/i,
      /^tos$/i
    ];

    return this.findPolicyLink(selectors, textPatterns);
  }

  findPrivacyPolicyLink() {
    const selectors = [
      'a[href*="privacy"]',
      'a[href*="policy"]'
    ];

    const textPatterns = [
      /privacy\s+policy/i,
      /privacy\s+notice/i,
      /data\s+policy/i,
      /^privacy$/i
    ];

    return this.findPolicyLink(selectors, textPatterns);
  }

  findPolicyLink(selectors, textPatterns) {
    // Try CSS selectors first
    for (const selector of selectors) {
      const links = document.querySelectorAll(selector);
      for (const link of links) {
        if (this.isValidPolicyLink(link, textPatterns)) {
          return this.normalizeUrl(link.href);
        }
      }
    }

    // Fallback: search all links by text content
    const allLinks = document.querySelectorAll('a[href]');
    for (const link of allLinks) {
      if (this.isValidPolicyLink(link, textPatterns)) {
        return this.normalizeUrl(link.href);
      }
    }

    return '';
  }

  isValidPolicyLink(link, patterns) {
    const text = link.textContent.trim().toLowerCase();
    const href = link.href.toLowerCase();
    
    // Check if text matches patterns
    for (const pattern of patterns) {
      if (pattern.test(text) || pattern.test(href)) {
        return true;
      }
    }
    
    return false;
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  detectPolicyLinks() {
    // Create a visual indicator when TOS/Privacy links are detected
    const tosLink = this.findTOSLink();
    const privacyLink = this.findPrivacyPolicyLink();
    const hasPolicy = tosLink || privacyLink;
    
    if (hasPolicy) {
      console.log('Policy links detected:', { tosLink, privacyLink });
      
      // Notify background script about policy detection
      chrome.runtime.sendMessage({
        action: 'detectPolicy',
        domain: this.domain,
        hasPolicy: true,
        tosUrl: tosLink,
        privacyUrl: privacyLink
      });
      
      // Optionally add visual indicators
      this.highlightPolicyLinks();
    }
  }

  highlightPolicyLinks() {
    const style = document.createElement('style');
    style.textContent = `
      .tos-privacy-detected {
        outline: 2px solid #4CAF50 !important;
        outline-offset: 2px !important;
        position: relative;
      }
      .tos-privacy-detected::after {
        content: "📋";
        position: absolute;
        top: -5px;
        right: -5px;
        background: #4CAF50;
        color: white;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
    `;
    document.head.appendChild(style);

    // Find and highlight TOS links
    const tosSelectors = ['a[href*="terms"]', 'a[href*="tos"]'];
    tosSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(link => {
        if (this.isValidPolicyLink(link, [/terms\s+of\s+(service|use)/i, /terms\s+&\s+conditions/i, /user\s+agreement/i, /^terms$/i, /^tos$/i])) {
          link.classList.add('tos-privacy-detected');
          link.title = 'Terms of Service detected by TOS Manager';
        }
      });
    });

    // Find and highlight Privacy links
    const privacySelectors = ['a[href*="privacy"]'];
    privacySelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(link => {
        if (this.isValidPolicyLink(link, [/privacy\s+policy/i, /privacy\s+notice/i, /data\s+policy/i, /^privacy$/i])) {
          link.classList.add('tos-privacy-detected');
          link.title = 'Privacy Policy detected by TOS Manager';
        }
      });
    });
  }
}

// Initialize the extractor when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new WebsiteDataExtractor();
  });
} else {
  new WebsiteDataExtractor();
}