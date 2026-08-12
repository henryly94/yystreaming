import path from "path";

// Authenticated qBittorrent Web API helper
export class QBittorrentClient {
  constructor(config = {}) {
    this.host = config.qbHost || "localhost";
    this.port = config.qbPort || 8080;
    this.username = config.qbUsername || "admin";
    this.password = config.qbPassword || "adminadmin";
    this.baseUrl = `http://${this.host}:${this.port}/api/v2`;
    this.cookie = null;
  }

  async login() {
    try {
      const params = new URLSearchParams();
      params.append("username", this.username);
      params.append("password", this.password);

      const originUrl = `http://${this.host}:${this.port}`;
      const res = await fetch(`${this.baseUrl}/auth/login`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": originUrl,
          "Origin": originUrl
        },
        body: params.toString()
      });

      const text = await res.text();
      console.log(`[qBittorrent Login Debug]: HTTP ${res.status}, Response: '${text}'`);

      if (res.ok && (text.includes("Ok.") || text.includes("Ok"))) {
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
          console.log('[qBittorrent Login]: Successfully authenticated!');
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("[qBittorrent]: Login request failed:", err.message);
      return false;
    }
  }

  async request(endpoint, paramsObj = {}, options = {}) {
    if (!this.cookie) {
      const loggedIn = await this.login();
      if (!loggedIn) {
        throw new Error("Failed to authenticate with qBittorrent Web UI");
      }
    }

    const formParams = new URLSearchParams();
    for (const [k, v] of Object.entries(paramsObj)) {
      if (v !== undefined && v !== null) {
        formParams.append(k, v);
      }
    }

    const originUrl = `http://${this.host}:${this.port}`;
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": originUrl,
        "Origin": originUrl,
        "Cookie": this.cookie || ""
      },
      body: formParams.toString(),
      ...options
    });

    if (res.status === 403) {
      // Re-authenticate if session expired
      this.cookie = null;
      await this.login();
      return this.request(endpoint, paramsObj, options);
    }

    return res;
  }

  // Batch add magnet/torrent URLs to target save path
  async addTorrents({ urls, savePath, category = "yyStreaming" }) {
    const urlList = Array.isArray(urls) ? urls.join("\n") : urls;
    const res = await this.request("/torrents/add", {
      urls: urlList,
      savepath: savePath,
      category: category,
      autoTMM: "false"
    });
    return res.ok;
  }

  // Add RSS Feed subscription URL
  async addRssFeed({ url, feedPath }) {
    const res = await this.request("/rss/addFeed", {
      url: url,
      path: feedPath
    });
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

    const res = await this.request("/rss/setRule", {
      ruleName: ruleName,
      ruleDef: JSON.stringify(ruleDef)
    });
    return res.ok;
  }
}
