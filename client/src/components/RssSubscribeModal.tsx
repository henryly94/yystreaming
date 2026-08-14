import React, { useState, useRef } from "react";
import { X, Rss, Download, Zap, AlertCircle, RefreshCw } from "lucide-react";

interface ParsedEpisode {
  rawTitle: string;
  episodeNum: string;
  cleanEpisodeName: string;
  isH264: boolean;
  is1080p: boolean;
  downloadUrl: string;
  allReleasesCount: number;
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
  const [rssUrl, setRssUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showName, setShowName] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [episodes, setEpisodes] = useState<ParsedEpisode[]>([]);
  const [rawItems, setRawItems] = useState<any[]>([]);
  const [step, setStep] = useState<"input" | "preview">("input");
  const mouseDownOnOverlay = useRef(false);

  if (!isOpen) return null;

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rssUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/rss/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rssUrl: rssUrl.trim() })
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
      setLoading(false);
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
          selectedEpisodes: episodes,
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
    setStep("input");
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

  // Dynamically compute filtered & deduplicated episodes from rawItems
  const filteredEpisodes = React.useMemo(() => {
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

  return (
    <div className="modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
      <div className="modal-content" style={{ maxWidth: "680px" }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Rss size={20} style={{ color: "var(--primary)" }} />
            <h2 className="modal-title">Import & Subscribe Anime RSS</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

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

          {step === "input" ? (
            <form onSubmit={handlePreview}>
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
                  Paste an RSS link from Mikan Project. `yyStreaming` will automatically clean show titles, pick 2-second fast remux releases (H.264/AVC), and configure qBittorrent rules.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <RefreshCw size={14} className="spin" /> Parsing RSS...
                    </>
                  ) : (
                    "Preview RSS Feed"
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubscribe}>
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

              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label">Subgroup / Format Filter Keyword (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 1080p 简繁内封 (AND) or 简繁内封|简体内嵌 (OR)"
                  value={filterKeyword}
                  onChange={e => setFilterKeyword(e.target.value)}
                />
                <div className="form-help">
                  Sets <code style={{ color: "var(--primary)" }}>mustContain</code> in qBittorrent. Use space for AND (<code style={{ color: "var(--primary)" }}>1080p 简繁</code>), or <code style={{ color: "var(--primary)" }}>|</code> for OR (<code style={{ color: "var(--primary)" }}>简繁|简体</code>).
                </div>
              </div>

              <div style={{ marginBottom: "14px", padding: "10px 12px", background: "var(--surface-hover)", borderRadius: "8px", border: "1px solid var(--border-light)", fontSize: "0.78rem" }}>
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
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
                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                  <span>Matching Past Episodes ({filteredEpisodes.length} / {episodes.length} episodes)</span>
                  <span style={{ fontSize: "0.75rem", color: "#4ade80", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Zap size={12} /> H.264 Fast Remux Prioritized
                  </span>
                </div>

                <div style={{
                  maxHeight: "240px",
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

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep("input")}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <RefreshCw size={14} className="spin" /> Subscribing & Syncing...
                    </>
                  ) : (
                    <>
                      <Download size={14} /> Start Auto-Download & Subscribe
                    </>
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
