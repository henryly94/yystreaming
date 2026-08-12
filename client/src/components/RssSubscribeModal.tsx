import React, { useState } from "react";
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
  const [episodes, setEpisodes] = useState<ParsedEpisode[]>([]);
  const [step, setStep] = useState<"input" | "preview">("input");

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
        setStep("preview");
      } else {
        setError(data.error || "Failed to preview RSS feed");
      }
    } catch (err: any) {
      console.error("Error previewing RSS feed:", err);
      setError("Error connecting to server: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
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
          selectedEpisodes: episodes
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
    setStep("input");
    setError(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
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
            <div>
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

              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                  <span>Deduplicated Episodes ({episodes.length} past episodes)</span>
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
                  {episodes.map(ep => (
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
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep("input")}>
                  Back
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSubscribe} disabled={submitting}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
