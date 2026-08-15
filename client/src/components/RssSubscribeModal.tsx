import React, { useState, useRef, useMemo } from "react";
import { X, Rss, Search, Sparkles, Film, ArrowLeft, Zap, AlertCircle, RefreshCw, Layers } from "lucide-react";

interface ParsedEpisode {
  rawTitle: string;
  episodeNum: string;
  cleanEpisodeName: string;
  isH264: boolean;
  is1080p: boolean;
  downloadUrl: string;
  allReleasesCount: number;
}

interface SearchAnimeResult {
  bangumiId: string;
  title: string;
  poster: string;
}

interface SubgroupInfo {
  subgroupId: string;
  subgroupName: string;
  rssUrl: string;
  tags: string[];
  recommendedPresets: string[];
  sampleCount: number;
  latestRelease: string;
}

interface AnimeDetails {
  bangumiId: string;
  showTitle: string;
  poster: string;
  subgroupsCount: number;
  subgroups: SubgroupInfo[];
}

interface RssSubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const RssSubscribeModal: React.FC<RssSubscribeModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  // Mode & navigation state
  const [activeTab, setActiveTab] = useState<"search" | "direct">("search");
  const [step, setStep] = useState<"search" | "subgroups" | "direct_input" | "preview">("search");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchAnimeResult[]>([]);
  const [selectedAnime, setSelectedAnime] = useState<AnimeDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Direct / Selected RSS state
  const [rssUrl, setRssUrl] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe preview form state
  const [showName, setShowName] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [episodes, setEpisodes] = useState<ParsedEpisode[]>([]);
  const [rawItems, setRawItems] = useState<any[]>([]);

  const mouseDownOnOverlay = useRef(false);

  // Dynamically compute filtered & deduplicated episodes from rawItems
  const filteredEpisodes = useMemo(() => {
    const kw = filterKeyword.trim();
    const isRegex = /[|*?()+\[\]\\]/.test(kw);

    if (!rawItems || rawItems.length === 0) {
      return episodes.filter(ep => {
        if (!kw) return true;
        const title = ep.rawTitle || ep.cleanEpisodeName || "";
        if (isRegex) {
          try { return new RegExp(kw, 'i').test(title); } catch (e) {}
        }
        return kw.split(/\s+/).filter(Boolean).every(k => title.toLowerCase().includes(k.toLowerCase()));
      });
    }

    // 1. Filter raw items first by filterKeyword
    const matchedRaw = rawItems.filter(item => {
      if (!kw) return true;
      const title = item.title || "";
      if (isRegex) {
        try { return new RegExp(kw, 'i').test(title); } catch (e) {}
      }
      return kw.split(/\s+/).filter(Boolean).every(k => title.toLowerCase().includes(k.toLowerCase()));
    });

    // 2. Parse & group by episodeNum
    const grouped = new Map<string, ParsedEpisode[]>();
    for (const item of matchedRaw) {
      const rawTitle = item.title || "";
      let epNum: string | null = null;
      const cnMatch = rawTitle.match(/第\s*(\d{1,4}(?:\.5)?)\s*(?:v\d+)?\s*[集話话]/i);
      if (cnMatch) epNum = cnMatch[1].padStart(2, "0");

      if (!epNum) {
        const epMatch = rawTitle.match(/(?:S\d+\s*)?E(?:P)?\s*(\d{1,4}(?:\.5)?)\b/i);
        if (epMatch) epNum = epMatch[1].padStart(2, "0");
      }

      if (!epNum) {
        const bracketMatches = [...rawTitle.matchAll(/(?:\[|【)\s*(\d{1,3}(?:\.5)?)(?:v\d+)?\s*(?:\]|】)/g)];
        for (const match of bracketMatches) {
          const fullMatchStr = match[0].toUpperCase();
          const num = parseInt(match[1], 10);
          if (fullMatchStr.includes("P") || fullMatchStr.includes("K") || fullMatchStr.includes("BIT")) continue;
          if (num === 1080 || num === 720 || num === 2160 || num === 264 || num === 265) continue;
          epNum = match[1].padStart(2, "0");
          break;
        }
      }

      if (!epNum) {
        const hyphenMatch = rawTitle.match(/(?:-\s*|\s+)(\d{1,3}(?:\.5)?)(?:\s*v\d+)?(?:\s+\[|\s+|$)/i);
        if (hyphenMatch) {
          const num = parseInt(hyphenMatch[1], 10);
          if (num !== 1080 && num !== 720 && num !== 2160 && num !== 264 && num !== 265) {
            epNum = hyphenMatch[1].padStart(2, "0");
          }
        }
      }

      if (!epNum) {
        const simpleHash = Math.abs(rawTitle.split("").reduce((acc: number, char: string) => ((acc << 5) - acc) + char.charCodeAt(0), 0)).toString(36).slice(0, 4);
        epNum = `EP_${simpleHash}`;
      }

      const parsed: ParsedEpisode = {
        rawTitle,
        episodeNum: epNum,
        cleanEpisodeName: `Episode ${epNum}`,
        isH264: /H\.?264|AVC/i.test(rawTitle),
        is1080p: /1080p|1920x1080/i.test(rawTitle),
        downloadUrl: item.enclosure?.url || item.link || "",
        allReleasesCount: 1
      };

      if (!grouped.has(epNum)) grouped.set(epNum, []);
      grouped.get(epNum)!.push(parsed);
    }

    // 3. Pick 1 best per episode number
    const selected: ParsedEpisode[] = [];
    for (const items of grouped.values()) {
      items.sort((a: ParsedEpisode, b: ParsedEpisode) => {
        if (a.is1080p !== b.is1080p) return a.is1080p ? -1 : 1;
        if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
        return 0;
      });
      selected.push(items[0]);
    }

    selected.sort((a, b) => a.episodeNum.localeCompare(b.episodeNum, undefined, { numeric: true }));
    return selected;
  }, [rawItems, episodes, filterKeyword]);

  if (!isOpen) return null;

  // Handle searching anime on Mikan
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setError(null);
    setSelectedAnime(null);

    try {
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSearchResults(data.results || []);
        if (data.results.length === 0) {
          setError(`No anime found for "${searchQuery.trim()}". Try simplifying your keywords.`);
        }
      } else {
        setError(data.error || "Search failed");
      }
    } catch (err: any) {
      console.error("Error searching anime:", err);
      setError("Error connecting to server: " + err.message);
    } finally {
      setSearching(false);
    }
  };

  // Handle selecting an anime to load its subgroups
  const handleSelectAnime = async (anime: SearchAnimeResult) => {
    setLoadingDetails(true);
    setError(null);

    try {
      const res = await fetch(`/api/anime/details/${anime.bangumiId}`);
      const data = await res.json();
      if (res.ok && data.success && data.details) {
        setSelectedAnime(data.details);
        setStep("subgroups");
      } else {
        setError(data.error || "Failed to load fansub groups for this anime");
      }
    } catch (err: any) {
      console.error("Error loading anime details:", err);
      setError("Error loading fansub details: " + err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Handle selecting a Subgroup (1-Click or custom preset)
  const handleSelectSubgroup = async (subgroup: SubgroupInfo, presetFilter: string = "") => {
    const targetUrl = subgroup.rssUrl;
    setRssUrl(targetUrl);
    setFilterKeyword(presetFilter || (subgroup.recommendedPresets.length > 0 ? subgroup.recommendedPresets[0] : ""));
    await loadRssPreview(targetUrl);
  };

  // Load RSS preview from URL
  const loadRssPreview = async (urlToPreview: string) => {
    if (!urlToPreview.trim()) return;

    setLoadingPreview(true);
    setError(null);

    try {
      const res = await fetch("/api/rss/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rssUrl: urlToPreview.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowName(data.proposedShowName);
        setEpisodes(data.episodes);
        setRawItems(data.rawItems || []);
        setStep("preview");
      } else {
        setError(data.error || "Failed to parse RSS feed");
      }
    } catch (err: any) {
      console.error("Error previewing RSS feed:", err);
      setError("Error connecting to server: " + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSubscribe = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!showName.trim() || episodes.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/rss/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rssUrl: rssUrl.trim(),
          showName: showName.trim(),
          filterKeyword: filterKeyword.trim(),
          selectedEpisodes: filteredEpisodes,
          rawItems
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess(`Subscribed to ${showName}! Queued ${data.episodesQueued} past episodes.`);
        handleReset();
        onClose();
      } else {
        setError(data.error || "Failed to subscribe RSS feed");
      }
    } catch (err: any) {
      console.error("Error subscribing RSS feed:", err);
      setError("Error connecting to server: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setRssUrl("");
    setShowName("");
    setEpisodes([]);
    setRawItems([]);
    setSearchResults([]);
    setSelectedAnime(null);
    setSearchQuery("");
    setFilterKeyword("");
    setStep("search");
    setActiveTab("search");
    setError(null);
  };

  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownOnOverlay.current = (e.target === e.currentTarget);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
      onClose();
    }
    mouseDownOnOverlay.current = false;
  };

  return (
    <div className="modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
      <div className="modal-content" style={{ maxWidth: "760px", width: "100%" }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={20} style={{ color: "var(--primary)" }} />
            <h2 className="modal-title" style={{ margin: 0 }}>Anime Tracker & RSS Auto-Download</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher (Search vs Direct URL) */}
        {step !== "preview" && (
          <div style={{
            display: "flex",
            gap: "8px",
            background: "var(--bg-surface)",
            padding: "4px",
            borderRadius: "10px",
            marginBottom: "16px",
            border: "1px solid var(--border-light)"
          }}>
            <button
              type="button"
              onClick={() => {
                setActiveTab("search");
                setStep("search");
                setError(null);
              }}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "none",
                borderRadius: "8px",
                background: activeTab === "search" ? "var(--primary)" : "transparent",
                color: activeTab === "search" ? "white" : "var(--text-muted)",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s"
              }}
            >
              <Search size={15} /> Search & Auto-Subscribe
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("direct");
                setStep("direct_input");
                setError(null);
              }}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "none",
                borderRadius: "8px",
                background: activeTab === "direct" ? "var(--primary)" : "transparent",
                color: activeTab === "direct" ? "white" : "var(--text-muted)",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s"
              }}
            >
              <Rss size={15} /> Custom RSS URL
            </button>
          </div>
        )}

        <div className="modal-body">
          {error && (
            <div style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#fca5a5",
              fontSize: "0.85rem",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* VIEW 1: SEARCH ANIME TAB */}
          {activeTab === "search" && step === "search" && (
            <div>
              <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    className="input-text"
                    style={{ width: "100%", paddingLeft: "36px" }}
                    placeholder="Type anime title (e.g. 芙莉莲, 无职转生, 鬼灭之刃...)"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={searching || !searchQuery.trim()} style={{ minWidth: "90px" }}>
                  {searching ? <RefreshCw size={15} className="spin" /> : "Search"}
                </button>
              </form>

              {loadingDetails && (
                <div style={{ padding: "30px", textAlign: "center", color: "var(--primary)" }}>
                  <RefreshCw size={24} className="spin" style={{ margin: "0 auto 10px" }} />
                  <div>Loading fansub groups...</div>
                </div>
              )}

              {!loadingDetails && searchResults.length > 0 && (
                <div style={{
                  maxHeight: "360px",
                  overflowY: "auto",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: "12px",
                  paddingRight: "4px"
                }}>
                  {searchResults.map(anime => (
                    <div
                      key={anime.bangumiId}
                      onClick={() => handleSelectAnime(anime)}
                      style={{
                        background: "var(--surface-hover)",
                        border: "1px solid var(--border-light)",
                        borderRadius: "10px",
                        padding: "10px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        transition: "transform 0.15s, border-color 0.15s"
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.borderColor = "var(--primary)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.borderColor = "var(--border-light)";
                      }}
                    >
                      <div style={{ width: "100%", height: "120px", borderRadius: "6px", overflow: "hidden", background: "#111" }}>
                        {anime.poster ? (
                          <img src={anime.poster} alt={anime.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                            <Film size={28} />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-main)", lineClamp: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {anime.title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--primary)", marginTop: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Layers size={13} /> Select Subgroups &rarr;
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: SUBGROUP SELECTOR VIEW */}
          {activeTab === "search" && step === "subgroups" && selectedAnime && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep("search")}
                  style={{ padding: "4px 8px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedAnime.showTitle}
                </div>
              </div>

              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                Available Fansub Groups ({selectedAnime.subgroupsCount}):
              </div>

              {loadingPreview ? (
                <div style={{ padding: "30px", textAlign: "center", color: "var(--primary)" }}>
                  <RefreshCw size={24} className="spin" style={{ margin: "0 auto 10px" }} />
                  <div>Loading episodes and setting up downloader rules...</div>
                </div>
              ) : (
                <div style={{ maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {selectedAnime.subgroups.map(subgroup => (
                    <div
                      key={subgroup.subgroupId}
                      style={{
                        background: "var(--surface-hover)",
                        border: "1px solid var(--border-light)",
                        borderRadius: "10px",
                        padding: "12px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                          {subgroup.subgroupName}
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleSelectSubgroup(subgroup)}
                          style={{ padding: "4px 12px", fontSize: "0.78rem" }}
                        >
                          ⚡ 1-Click Subscribe
                        </button>
                      </div>

                      {/* Format Tags */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                        {subgroup.tags.map(tag => (
                          <span
                            key={tag}
                            className="badge"
                            style={{
                              background: tag.includes("1080") ? "rgba(59, 130, 246, 0.2)" :
                                          tag.includes("简繁") || tag.includes("内封") ? "rgba(16, 185, 129, 0.2)" :
                                          tag.includes("Baha") || tag.includes("巴哈") ? "rgba(245, 158, 11, 0.2)" :
                                          "rgba(255, 255, 255, 0.08)",
                              color: tag.includes("1080") ? "#93c5fd" :
                                     tag.includes("简繁") || tag.includes("内封") ? "#6ee7b7" :
                                     tag.includes("Baha") || tag.includes("巴哈") ? "#fcd34d" :
                                     "var(--text-main)",
                              fontSize: "0.72rem",
                              padding: "2px 6px"
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Quick Filter Presets */}
                      {subgroup.recommendedPresets.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", marginTop: "2px" }}>
                          <span style={{ color: "var(--text-muted)" }}>Quick Filter:</span>
                          {subgroup.recommendedPresets.map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleSelectSubgroup(subgroup, preset)}
                              style={{
                                background: "rgba(99, 102, 241, 0.15)",
                                border: "1px solid rgba(99, 102, 241, 0.3)",
                                color: "#a5b4fc",
                                borderRadius: "4px",
                                padding: "2px 8px",
                                fontSize: "0.72rem",
                                cursor: "pointer"
                              }}
                            >
                              ⚡ {preset}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: DIRECT CUSTOM RSS URL TAB */}
          {activeTab === "direct" && step === "direct_input" && (
            <form onSubmit={(e) => { e.preventDefault(); loadRssPreview(rssUrl); }}>
              <div className="form-group">
                <label className="form-label">Mikan / Anime RSS Feed URL</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://mikanani.me/RSS/Bangumi?bangumiId=3994&subgroupid=1253"
                  value={rssUrl}
                  onChange={e => setRssUrl(e.target.value)}
                  required
                />
                <div className="form-help">
                  Paste any custom RSS link. `yyStreaming` will clean the title and configure rules automatically.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loadingPreview || !rssUrl.trim()}>
                  {loadingPreview ? (
                    <>
                      <RefreshCw size={14} className="spin" /> Parsing RSS...
                    </>
                  ) : (
                    "Preview RSS Feed"
                  )}
                </button>
              </div>
            </form>
          )}

          {/* VIEW 4: STEP 2 CONFIRMATION & PAST EPISODES PREVIEW */}
          {step === "preview" && (
            <form onSubmit={handleSubscribe}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(activeTab === "search" ? "subgroups" : "direct_input")}
                  style={{ padding: "4px 8px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Step 2 of 2: Configure show folder & review past episodes
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Clean Show Folder Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={showName}
                  onChange={e => setShowName(e.target.value)}
                  required
                />
                <div className="form-help">
                  This clean folder will be created inside your media directory.
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label">Subgroup / Format Filter Keyword (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 1080p 简繁内封 (AND) or Baha|MP4 (OR)"
                  value={filterKeyword}
                  onChange={e => setFilterKeyword(e.target.value)}
                />
                <div className="form-help">
                  Sets <code style={{ color: "var(--primary)" }}>mustContain</code> in qBittorrent. Use space for AND (<code style={{ color: "var(--primary)" }}>1080p 简繁</code>), or <code style={{ color: "var(--primary)" }}>|</code> for OR (<code style={{ color: "var(--primary)" }}>Baha|MP4</code>).
                </div>
              </div>

              <div style={{ marginBottom: "14px", padding: "10px 12px", background: "var(--surface-hover)", borderRadius: "8px", border: "1px solid var(--border-light)", fontSize: "0.78rem" }}>
                <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)", marginRight: "6px" }}>Category:</span>
                    <span style={{ fontWeight: 600, color: "var(--primary)" }}>Anime/{showName || 'ShowTitle'}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", marginRight: "6px" }}>Auto Tags:</span>
                    <span className="badge" style={{ background: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc", border: "1px solid rgba(99, 102, 241, 0.4)", marginRight: "4px" }}>rss-auto</span>
                    <span className="badge" style={{ background: "rgba(34, 197, 94, 0.2)", color: "#86efac", border: "1px solid rgba(34, 197, 94, 0.4)" }}>status:airing</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Matching Past Episodes ({filteredEpisodes.length} / {episodes.length} episodes)</span>
                  <span style={{ fontSize: "0.75rem", color: "#4ade80", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Zap size={12} /> H.264 Fast Remux Prioritized
                  </span>
                </div>

                <div style={{
                  maxHeight: "220px",
                  overflowY: "auto",
                  background: "var(--surface-hover)",
                  borderRadius: "8px",
                  padding: "8px",
                  border: "1px solid var(--border-light)"
                }}>
                  {filteredEpisodes.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
                      No episodes match the keyword "{filterKeyword}".
                    </div>
                  ) : (
                    filteredEpisodes.map(ep => (
                      <div key={ep.episodeNum} style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--border-light)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.85rem"
                      }}>
                        <div>
                          <span style={{ fontWeight: 600, color: "var(--text-main)", marginRight: "8px" }}>
                            {ep.cleanEpisodeName}
                          </span>
                          {ep.isH264 && (
                            <span className="badge" style={{ background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.4)", fontSize: "0.7rem", padding: "1px 6px" }}>
                              Fast Remux H.264
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ep.rawTitle}>
                          {ep.rawTitle}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || filteredEpisodes.length === 0}>
                  {submitting ? (
                    <>
                      <RefreshCw size={14} className="spin" /> Subscribing...
                    </>
                  ) : (
                    `🚀 Confirm & Queue ${filteredEpisodes.length} Episodes`
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
