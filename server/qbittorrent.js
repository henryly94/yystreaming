import path from "path";

// Authenticated qBittorrent Web API helper
export class QBittorrentClient {
  constructor(config = {}) {
    this.host = config.qbHost || "127.0.0.1";
    this.port = config.qbPort || 8080;
    this.username = config.qbUsername || "admin";
    this.password = config.qbPassword || "adminadmin";
    this.baseUrl = `http://${this.host}:${this.port}/api/v2`;
    this.cookie = null;
  }

  async login() {
    this.lastError = null;
    try {
      const params = new URLSearchParams();
      params.append("username", this.username);
      params.append("password", this.password);

      const originUrl = `http://${this.host}:${this.port}`;
      console.log(`[qBittorrent]: Connecting to ${this.baseUrl}/auth/login (user: '${this.username}')...`);
      
      const res = await fetch(`${this.baseUrl}/auth/login`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": originUrl,
          "Origin": originUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        body: params.toString()
      });

      const text = await res.text();
      console.log(`[qBittorrent Login Debug]: HTTP ${res.status}, Response: '${text}'`);

      // qBittorrent returns 200 OK ("Ok.") with Set-Cookie: SID=... on valid authentication
      if (res.ok && !text.includes("Fails") && res.status !== 403) {
        let sid = null;
        if (typeof res.headers.getSetCookie === 'function') {
          const cookieList = res.headers.getSetCookie();
          for (const c of cookieList) {
            const match = c.match(/SID=([^;]+)/);
            if (match) sid = match[1];
          }
        }
        if (!sid) {
          const rawCookies = res.headers.get("set-cookie") || "";
          const match = rawCookies.match(/SID=([^;]+)/);
          if (match) sid = match[1];
        }

        if (sid) {
          this.cookie = `SID=${sid}`;
          console.log('[qBittorrent Login]: Successfully authenticated with SID cookie.');
          return true;
        } else {
          this.lastError = `Authentication failed: qBittorrent rejected credentials (no SID cookie returned). Default Docker username is usually 'admin'.`;
          console.error('[qBittorrent Login]: No SID cookie returned.');
          return false;
        }
      } else {
        if (text.includes("banned") || res.status === 403) {
          this.lastError = `qBittorrent IP Ban: Your IP address has been temporarily banned by qBittorrent due to previous invalid password attempts. Please restart your qBittorrent container ('docker restart qbittorrent') and try again.`;
        } else {
          this.lastError = `Authentication failed (HTTP ${res.status}): ${text || 'Invalid username or password'}`;
        }
      }
      return false;
    } catch (err) {
      this.lastError = `Connection error (${this.host}:${this.port}): ${err.message}`;
      console.error("[qBittorrent]: Login request failed:", err.message);
      return false;
    }
  }

  async testConnection() {
    // Authenticate and verify SID cookie issuance
    const success = await this.login();
    if (!success) {
      return { success: false, error: this.lastError || "Authentication failed" };
    }

    try {
      const verRes = await this.request('/app/version');
      const version = verRes.ok ? await verRes.text() : 'Connected';
      return { success: true, version: `${version.trim()} (Authenticated)` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async request(endpoint, bodyData = {}, options = {}, isRetry = false) {
    const originUrl = `http://${this.host}:${this.port}`;
    const headers = {
      "Referer": originUrl,
      "Origin": originUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    };

    if (this.cookie) {
      headers["Cookie"] = this.cookie;
    }

    let reqBody;
    if (bodyData instanceof FormData) {
      reqBody = bodyData;
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const formParams = new URLSearchParams();
      for (const [k, v] of Object.entries(bodyData)) {
        if (v !== undefined && v !== null) {
          formParams.append(k, v);
        }
      }
      reqBody = formParams.toString();
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: reqBody,
      ...options
    });

    console.log(`[qBittorrent API Debug]: Endpoint ${endpoint} -> Status ${res.status}`);

    // If forbidden/unauthorized and we haven't retried yet:
    if ((res.status === 403 || res.status === 401) && !isRetry) {
      console.log(`[qBittorrent]: ${endpoint} returned ${res.status}. Attempting login...`);
      const loggedIn = await this.login();
      if (loggedIn && this.cookie) {
        return this.request(endpoint, bodyData, options, true);
      } else {
        throw new Error(`qBittorrent API ${endpoint} failed (HTTP ${res.status}): Forbidden. Please check your qBittorrent Username (default: 'admin') and Password in Settings.`);
      }
    }

    return res;
  }

  // Batch add magnet/torrent URLs to target save path
  async addTorrents({ urls, savePath, category = "yyStreaming" }) {
    const urlList = Array.isArray(urls) ? urls.join("\n") : urls;
    console.log(`[qBittorrent API]: Adding torrent(s) via FormData to savePath: '${savePath}'`);
    
    // qBittorrent /torrents/add requires multipart/form-data
    const formData = new FormData();
    formData.append("urls", urlList);
    formData.append("savepath", savePath);
    formData.append("category", category);
    formData.append("autoTMM", "false");

    const res = await this.request('/torrents/add', formData);
    const text = await res.text();
    console.log(`[qBittorrent API]: /torrents/add result: Status ${res.status}, Body: '${text}'`);
    return res.ok;
  }

  // Add RSS Feed subscription URL
  async addRssFeed({ url, feedPath }) {
    console.log(`[qBittorrent API]: Adding RSS Feed '${url}' with path '${feedPath}'`);
    const res = await this.request('/rss/addFeed', {
      url: url,
      path: feedPath
    });
    const text = await res.text();
    console.log(`[qBittorrent API]: /rss/addFeed result: Status ${res.status}, Body: '${text}'`);
    return res.ok;
  }

  // Create RSS Downloader Auto-Rule
  async setRssRule({ ruleName, savePath, feedPath, mustContain = "" }) {
    const ruleDef = {
      enabled: true,
      mustContain: mustContain,
      mustNotContain: "",
      useRegex: false,
      episodeFilter: "",
      smartFilter: false,
      previouslyMatchedEpisodes: [],
      affectedFeeds: [feedPath],
      savePath: savePath,
      autoDeleteMode: 0,
      addPaused: false
    };

    console.log(`[qBittorrent API]: Setting RSS Rule '${ruleName}' for path '${feedPath}' -> '${savePath}'`);
    const res = await this.request('/rss/setRule', {
      ruleName: ruleName,
      ruleDef: JSON.stringify(ruleDef)
    });
    const text = await res.text();
    console.log(`[qBittorrent API]: /rss/setRule result: Status ${res.status}, Body: '${text}'`);
    return res.ok;
  }
}
