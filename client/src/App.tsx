import { useState, useEffect } from 'react';
import { 
  Tv, Settings as SettingsIcon, Play, Pause, AlertCircle, 
  Search, ArrowLeft, CheckCircle2, CircleDot, RefreshCw,
  ArrowUp, Rss
} from 'lucide-react';
import { VideoPlayer } from './components/VideoPlayer';
import { SettingsModal } from './components/SettingsModal';
import { RssSubscribeModal } from './components/RssSubscribeModal';

interface Episode {
  id: string;
  name: string;
  fileName: string;
  hasSubtitle: boolean;
  subtitleExt: string | null;
  duration?: number;
}

interface Show {
  id: string;
  name: string;
  hasCover: boolean;
  coverExt: string | null;
  episodes: Episode[];
}

interface Settings {
  videoDir: string;
  port: number;
  localIps: string[];
  ffmpegAvailable?: boolean;
}

interface WatchProgress {
  currentTime: number;
  duration: number;
  percentage: number;
}

interface OptimizeProgress {
  isRunning: boolean;
  isPaused?: boolean;
  currentFile: string | null;
  currentIndex: number;
  totalFiles: number;
  currentTime: number;
  totalDuration: number;
  percentage: number;
  speed: string;
  eta: number;
  error?: string;
}

export default function App() {
  const [library, setLibrary] = useState<Show[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState<OptimizeProgress | null>(null);
  const [optimizeQueue, setOptimizeQueue] = useState<any[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);
  const [isRssModalOpen, setIsRssModalOpen] = useState(false);

  // Load progress states to force UI updates when progress changes
  const [_, setProgressTrigger] = useState(0);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handlePrioritizeVideo = async (absolutePath: string) => {
    try {
      const res = await fetch('/api/library/optimize/queue/prioritize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ absolutePath })
      });
      if (res.ok) {
        showToast('Moved video to next in queue!');
        // Fetch updated queue immediately
        const queueRes = await fetch('/api/library/optimize/queue');
        if (queueRes.ok) {
          const data = await queueRes.json();
          setOptimizeQueue(data);
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to prioritize video');
      }
    } catch (err) {
      console.error('Error prioritizing video:', err);
      alert('Error prioritizing video');
    }
  };

  const handleRetranscodeEpisode = async (ep: Episode) => {
    try {
      const res = await fetch('/api/library/optimize/retranscode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: ep.id })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Queued ${ep.name} for re-transcoding!`);
        setIsQueueExpanded(true);
        const progressRes = await fetch('/api/library/optimize/progress');
        if (progressRes.ok) setOptimizeProgress(await progressRes.json());
        const queueRes = await fetch('/api/library/optimize/queue');
        if (queueRes.ok) setOptimizeQueue(await queueRes.json());
      } else {
        alert(data.error || 'Failed to queue re-transcode');
      }
    } catch (e) {
      console.error('Error requesting re-transcode:', e);
      alert('Error requesting re-transcode');
    }
  };

  const handlePauseOptimization = async () => {
    try {
      const res = await fetch('/api/library/optimize/pause', { method: 'POST' });
      if (res.ok) {
        showToast('Optimization paused!');
        const progressRes = await fetch('/api/library/optimize/progress');
        if (progressRes.ok) setOptimizeProgress(await progressRes.json());
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to pause optimization');
      }
    } catch (e) {
      console.error('Error pausing optimization:', e);
    }
  };

  const handleResumeOptimization = async () => {
    try {
      const res = await fetch('/api/library/optimize/resume', { method: 'POST' });
      if (res.ok) {
        showToast('Optimization resumed!');
        const progressRes = await fetch('/api/library/optimize/progress');
        if (progressRes.ok) setOptimizeProgress(await progressRes.json());
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to resume optimization');
      }
    } catch (e) {
      console.error('Error resuming optimization:', e);
    }
  };

  const getBaseName = (fileName: string) => {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  };

  const isEpisodeRetranscoding = (ep: Episode) => {
    if (!ep || !ep.fileName) return false;
    const epBaseName = getBaseName(ep.fileName);
    const isCurrentlyEncoding = !!(optimizeProgress?.isRunning && 
      optimizeProgress?.currentFile && 
      (optimizeProgress.currentFile.includes(epBaseName) || optimizeProgress.currentFile === ep.fileName));

    const isQueued = optimizeQueue.some(item => 
      (item.baseName && item.baseName === epBaseName) || item.fileName === ep.fileName
    );

    return isCurrentlyEncoding || isQueued;
  };

  const fetchLibrary = async () => {
    try {
      const res = await fetch('/api/library');
      if (res.ok) {
        const data = await res.json();
        setLibrary(data);
      }
    } catch (err) {
      console.error('Failed to fetch library:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchLibrary(), fetchSettings()]);
      setIsLoading(false);
    };
    init();
  }, []);

  // Poll library optimization progress and queue
  useEffect(() => {
    const checkProgress = async () => {
      try {
        const res = await fetch('/api/library/optimize/progress');
        if (res.ok) {
          const data = await res.json();
          setOptimizeProgress(data);
          
          // If optimizer finishes, refresh the catalog
          if (optimizeProgress?.isRunning && !data.isRunning) {
            fetchLibrary();
            showToast('Library optimization completed!');
          }
        }
      } catch (err) {
        console.error('Failed to fetch optimize progress:', err);
      }
    };

    const checkQueue = async () => {
      try {
        const res = await fetch('/api/library/optimize/queue');
        if (res.ok) {
          const data = await res.json();
          setOptimizeQueue(data);
        }
      } catch (err) {
        console.error('Failed to fetch optimize queue:', err);
      }
    };

    const pollAll = () => {
      checkProgress();
      checkQueue();
    };

    pollAll();
    const interval = setInterval(pollAll, 3000);
    return () => clearInterval(interval);
  }, [optimizeProgress?.isRunning]);

  const formatEta = (seconds: number) => {
    if (seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const handleSaveSettings = async (videoDir: string, qbConfig?: { qbHost: string; qbPort: number; qbUsername: string; qbPassword: string }): Promise<boolean> => {
    try {
      const payload = { videoDir, ...qbConfig };
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        showToast('Settings saved successfully!');
        await fetchLibrary();
        return true;
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save settings');
        return false;
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert('Error connecting to server settings');
      return false;
    }
  };

  const handleRescan = async () => {
    await fetchLibrary();
    showToast('Library scanned successfully!');
  };

  const handlePlayEpisode = (episode: Episode) => {
    setSelectedEpisode(episode);
    const isMkv = episode.fileName.toLowerCase().match(/\.(mkv|avi|mov)$/);
    setIsTranscoding(!!(isMkv && settings?.ffmpegAvailable));
  };

  const handleNextEpisode = () => {
    if (!selectedShow || !selectedEpisode) return;
    const currentIndex = selectedShow.episodes.findIndex(ep => ep.id === selectedEpisode.id);
    if (currentIndex !== -1 && currentIndex < selectedShow.episodes.length - 1) {
      const nextEp = selectedShow.episodes[currentIndex + 1];
      setSelectedEpisode(nextEp);
      const isMkv = nextEp.fileName.toLowerCase().match(/\.(mkv|avi|mov)$/);
      setIsTranscoding(!!(isMkv && settings?.ffmpegAvailable));
    }
  };

  // Check watch status for a single episode
  const getEpisodeProgress = (episodeId: string): WatchProgress | null => {
    const saved = localStorage.getItem(`yystreaming_progress_${episodeId}`);
    if (saved) {
      try {
        return JSON.parse(saved) as WatchProgress;
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  // Summarize watch status for a show
  const getShowWatchStatus = (show: Show) => {
    let watchedCount = 0;
    let inProgressCount = 0;
    
    show.episodes.forEach(ep => {
      const prog = getEpisodeProgress(ep.id);
      if (prog) {
        // Safe check: ensure duration stored in progress matches actual parsed duration
        const isDurationValid = !ep.duration || Math.abs(prog.duration - ep.duration) < 5;
        if (isDurationValid) {
          if (prog.percentage > 92 && prog.percentage <= 100) {
            watchedCount++;
          } else if (prog.percentage > 1 && prog.percentage <= 100) {
            inProgressCount++;
          }
        } else {
          // Auto-clean corrupted historical watch progress
          localStorage.removeItem(`yystreaming_progress_${ep.id}`);
        }
      }
    });

    return { watchedCount, inProgressCount };
  };

  // Reset to home view when logo is clicked
  const goHome = () => {
    setSelectedShow(null);
    setSelectedEpisode(null);
    setSearchQuery('');
    // Refresh progress indicators
    setProgressTrigger(prev => prev + 1);
  };

  const filteredShows = library.filter(show => 
    show.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo-container" onClick={goHome}>
          <div className="logo-icon">
            <Tv size={24} />
          </div>
          <span className="logo-text">yyStreaming</span>
        </div>

        {/* Search bar (only on main dashboard) */}
        {!selectedShow && !selectedEpisode && (
          <div style={{ position: 'relative', width: '320px' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-text"
              placeholder="Search albums..."
              style={{ width: '100%', paddingLeft: '44px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        <div className="nav-actions" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => setIsRssModalOpen(true)}>
            <Rss size={16} />
            Import Anime RSS
          </button>
          <button className="btn" onClick={() => setIsSettingsOpen(true)}>
            <SettingsIcon size={16} />
            Settings
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="main-content">
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '16px' }}>
            <div className="spin" style={{ width: '40px', height: '40px', border: '3px solid var(--border-medium)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}></div>
            <p style={{ color: 'var(--text-muted)' }}>Loading library...</p>
          </div>
        ) : selectedEpisode && selectedShow ? (
          /* --- PLAYER VIEW --- */
          <div className="player-page-container">
            <div className="player-main-area">
              <div className="back-nav">
                <button className="btn" onClick={() => {
                  setSelectedEpisode(null);
                  setProgressTrigger(prev => prev + 1);
                }}>
                  <ArrowLeft size={16} />
                  Back to Album
                </button>
              </div>

              {/* Custom player component */}
              <VideoPlayer
                episodeId={selectedEpisode.id}
                videoUrl={isTranscoding ? `/api/transcode/${selectedEpisode.id}` : `/api/stream/${selectedEpisode.id}`}
                subtitleUrl={selectedEpisode.hasSubtitle ? `/api/subtitles/${selectedEpisode.id}` : null}
                title={selectedEpisode.name}
                onNextEpisode={handleNextEpisode}
                hasNextEpisode={
                  selectedShow.episodes.findIndex(ep => ep.id === selectedEpisode.id) < selectedShow.episodes.length - 1
                }
                durationMetadata={selectedEpisode.duration}
              />

              <div style={{ marginTop: '16px' }}>
                <h1 style={{ fontSize: '1.6rem', marginBottom: '8px' }}>{selectedEpisode.name}</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                  Playing from: <span style={{ color: 'var(--primary)', fontWeight: '500' }}>{selectedShow.name}</span>
                </p>
              </div>

              {/* External Player Options & Format warnings */}
              <div style={{ 
                marginTop: '24px', 
                padding: '20px', 
                background: 'var(--bg-card)', 
                border: '1px solid var(--border-light)', 
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      External Player Options
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      Stream this episode in external players like VLC or IINA for full format support (HEVC, FLAC, Advanced Subtitles).
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <a 
                      href={`vlc://${window.location.origin}/api/stream/${selectedEpisode.id}`}
                      className="btn btn-primary"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Play size={14} fill="currentColor" />
                      Play in VLC
                    </a>
                    <button 
                      className="btn"
                      onClick={() => {
                        const url = `${window.location.origin}/api/stream/${selectedEpisode.id}`;
                        navigator.clipboard.writeText(url);
                        showToast('Stream link copied to clipboard!');
                      }}
                    >
                      Copy Stream Link
                    </button>
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '12px 16px', 
                  background: 'rgba(99, 102, 241, 0.05)', 
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                  borderRadius: 'var(--radius-sm)',
                  gap: '16px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CircleDot size={14} style={{ color: 'var(--primary)' }} />
                      Server-Side Transcoding
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {settings?.ffmpegAvailable 
                        ? 'Convert video on-the-fly to H.264 / AAC for direct playback in your browser.'
                        : 'Transcoding is unavailable because FFmpeg is not installed on the server.'}
                    </div>
                  </div>
                  <div>
                    {settings?.ffmpegAvailable ? (
                      <button 
                        className={`btn ${isTranscoding ? 'btn-primary' : ''}`}
                        onClick={() => setIsTranscoding(prev => !prev)}
                        style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                      >
                        {isTranscoding ? 'ON (Transcoding)' : 'OFF (Direct Play)'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 'bold' }}>
                        FFmpeg Missing
                      </span>
                    )}
                  </div>
                </div>

                {selectedEpisode.fileName.toLowerCase().match(/\.(mkv|avi|mov)$/) && (
                  <div style={{ 
                    display: 'flex', 
                    gap: '12px', 
                    padding: '12px 16px', 
                    background: 'rgba(239, 68, 68, 0.05)', 
                    border: '1px solid rgba(239, 68, 68, 0.15)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                    alignItems: 'flex-start'
                  }}>
                    <AlertCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong style={{ color: 'var(--text-main)' }}>Format Notice:</strong> This video is an <code style={{ color: 'var(--primary)' }}>{selectedEpisode.fileName.split('.').pop()?.toUpperCase()}</code> file.
                      Web browsers might fail to decode HEVC/H.265 video or FLAC audio streams natively. If the video fails to load, has no audio, or stutters, please click <strong>Play in VLC</strong> or use your preferred media player.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Episode List */}
            <aside className="player-sidebar">
              <div className="sidebar-header">
                <h3 className="sidebar-title">Album Playlist</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {selectedShow.episodes.length} episodes
                </span>
              </div>
              <div className="sidebar-episode-list">
                {selectedShow.episodes.map((ep, idx) => {
                  const isActive = ep.id === selectedEpisode.id;
                  const progress = getEpisodeProgress(ep.id);
                  const isCompleted = progress && progress.percentage > 92;
                  const isRetranscodingThis = isEpisodeRetranscoding(ep);

                  return (
                    <div
                      key={ep.id}
                      className={`sidebar-episode-item ${isActive ? 'active' : ''}`}
                      onClick={() => handlePlayEpisode(ep)}
                    >
                      <div className="sidebar-episode-name" title={ep.name}>
                        {idx + 1}. {ep.name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {isRetranscodingThis && (
                            <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#fde047', border: '1px solid rgba(234, 179, 8, 0.3)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem' }}>
                              <RefreshCw size={9} className="spin" /> Transcoding...
                            </span>
                          )}
                          {ep.hasSubtitle && <span className="badge badge-sub">SUB</span>}
                        </span>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isCompleted ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={12} /> Watched
                            </span>
                          ) : progress && progress.percentage > 1 ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CircleDot size={12} /> {Math.round(progress.percentage)}%
                            </span>
                          ) : null}

                          <button
                            className="btn"
                            style={{ 
                              padding: '1px 6px', 
                              fontSize: '0.7rem', 
                              height: '22px', 
                              background: 'var(--surface-hover)',
                              border: '1px solid var(--border-light)'
                            }}
                            title="Re-transcode with subtitle fix"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetranscodeEpisode(ep);
                            }}
                          >
                            <RefreshCw size={10} className={isRetranscodingThis ? "spin" : ""} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        ) : selectedShow ? (
          /* --- DETAIL VIEW --- */
          <div>
            <div className="back-nav">
              <button className="btn" onClick={goHome}>
                <ArrowLeft size={16} />
                Back to Gallery
              </button>
            </div>

            <div className="show-detail-container">
              {/* Left Column: Cover */}
              <div className="show-sidebar-card">
                <div className="show-cover-wrapper">
                  {selectedShow.hasCover ? (
                    <img 
                      className="show-cover" 
                      src={`/api/cover/${selectedShow.id}`} 
                      alt={selectedShow.name} 
                    />
                  ) : (
                    <div className="show-cover-fallback" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)' }}>
                      <Tv size={48} className="show-cover-fallback-icon" />
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'white', marginTop: '12px' }}>
                        {selectedShow.name}
                      </div>
                    </div>
                  )}
                </div>
                <div className="show-sidebar-info">
                  <h2 className="show-sidebar-title">{selectedShow.name}</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Total Episodes: {selectedShow.episodes.length}
                  </p>
                </div>
              </div>

              {/* Right Column: Episodes */}
              <div className="episode-section">
                <h3 style={{ fontSize: '1.3rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                  Episode Pick
                </h3>

                <div className="episode-list">
                  {selectedShow.episodes.map((ep, idx) => {
                    const progress = getEpisodeProgress(ep.id);
                    const isCompleted = progress && progress.percentage > 92;
                    const isRetranscodingThis = isEpisodeRetranscoding(ep);

                    return (
                      <div
                        key={ep.id}
                        className="episode-item"
                        onClick={() => handlePlayEpisode(ep)}
                      >
                        <div className="episode-title">
                          <span style={{ color: 'var(--primary)', fontWeight: 'bold', minWidth: '24px' }}>
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          {ep.name}
                        </div>
                        
                        <div className="episode-tags" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isRetranscodingThis && (
                            <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#fde047', border: '1px solid rgba(234, 179, 8, 0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <RefreshCw size={10} className="spin" /> Re-transcoding...
                            </span>
                          )}

                          {ep.hasSubtitle && <span className="badge badge-sub">Subtitle</span>}
                          
                          {isCompleted ? (
                            <span className="progress-indicator" style={{ color: 'var(--secondary)' }}>
                              <CheckCircle2 size={14} /> Completed
                            </span>
                          ) : progress && progress.percentage > 1 ? (
                            <span className="progress-indicator">
                              <CircleDot size={14} /> {Math.round(progress.percentage)}% watched
                            </span>
                          ) : (
                            <span className="progress-indicator" style={{ color: 'var(--text-dim)' }}>
                              <Play size={12} fill="currentColor" /> Play
                            </span>
                          )}

                          <button
                            className="btn"
                            style={{ 
                              padding: '2px 8px', 
                              fontSize: '0.75rem', 
                              height: '26px', 
                              background: 'var(--surface-hover)',
                              border: '1px solid var(--border-light)',
                              gap: '4px' 
                            }}
                            title="Re-transcode with subtitle fix"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetranscodeEpisode(ep);
                            }}
                          >
                            <RefreshCw size={11} className={isRetranscodingThis ? "spin" : ""} />
                            Re-transcode
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* --- DASHBOARD / CATALOG VIEW --- */
          <div>
            <h1 className="section-title">
              <Tv size={26} style={{ color: 'var(--primary)' }} />
              Video Gallery
            </h1>

            {/* Live Library Optimization Progress Dashboard Card */}
            {optimizeProgress && (optimizeProgress.isRunning || optimizeProgress.isPaused || (optimizeQueue && optimizeQueue.length > 0)) && (
              <div className="optimize-dashboard-card">
                <div className="optimize-card-header">
                  <div className="optimize-title-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={14} className={optimizeProgress.isRunning ? "spin" : ""} style={{ color: optimizeProgress.isPaused ? '#fde047' : 'var(--primary)' }} />
                    <span className="optimize-card-title">
                      {optimizeProgress.isPaused ? 'Optimization Paused' : 'Optimizing Media Library'}
                    </span>
                    {optimizeProgress.isPaused && (
                      <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#fde047', border: '1px solid rgba(234, 179, 8, 0.4)' }}>
                        Paused
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {optimizeProgress.isPaused ? (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '3px 10px', fontSize: '0.75rem', height: '26px', gap: '4px' }}
                        onClick={handleResumeOptimization}
                      >
                        <Play size={12} fill="currentColor" /> Resume
                      </button>
                    ) : optimizeProgress.isRunning ? (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 10px', fontSize: '0.75rem', height: '26px', gap: '4px' }}
                        onClick={handlePauseOptimization}
                      >
                        <Pause size={12} fill="currentColor" /> Pause
                      </button>
                    ) : null}

                    {optimizeProgress.totalFiles > 0 && (
                      <span className="optimize-card-index">
                        File {optimizeProgress.currentIndex} of {optimizeProgress.totalFiles}
                      </span>
                    )}
                  </div>
                </div>
                
                {optimizeProgress.currentFile && (
                  <div className="optimize-file-name" title={optimizeProgress.currentFile}>
                    {optimizeProgress.currentFile}
                  </div>
                )}
                
                {optimizeProgress.isRunning && (
                  <>
                    <div className="optimize-progress-wrapper">
                      <div className="optimize-progress-bar-bg">
                        <div 
                          className="optimize-progress-bar-fill" 
                          style={{ width: `${optimizeProgress.percentage}%` }}
                        ></div>
                      </div>
                      <span className="optimize-percentage-text">{optimizeProgress.percentage}%</span>
                    </div>
                    
                    <div className="optimize-card-footer">
                      <span>Speed: <strong style={{ color: 'var(--text-main)' }}>{optimizeProgress.speed}</strong></span>
                      <span>ETA: <strong style={{ color: 'var(--text-main)' }}>{formatEta(optimizeProgress.eta)}</strong></span>
                    </div>
                  </>
                )}

                {/* Optimization Queue List */}
                {optimizeQueue && optimizeQueue.length > 0 && (
                  <div className="optimize-queue-container" style={{ marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Upcoming Queue ({optimizeQueue.length} pending)</span>
                      <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>Click Prioritize to process next</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: isQueueExpanded ? '350px' : '180px', overflowY: 'auto', paddingRight: '4px' }}>
                      {optimizeQueue.slice(0, isQueueExpanded ? undefined : 5).map((item, idx) => (
                        <div 
                          key={item.absolutePath} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '6px 10px', 
                            background: 'rgba(255,255,255,0.02)', 
                            border: '1px solid var(--border-light)', 
                            borderRadius: '4px',
                            fontSize: '0.8rem'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%', color: 'var(--text-muted)' }} title={item.fileName}>
                            {idx + 1}. {item.fileName}
                          </span>
                          <button 
                            className="btn btn-primary"
                            style={{ padding: '2px 8px', fontSize: '0.75rem', height: 'auto', minHeight: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handlePrioritizeVideo(item.absolutePath)}
                            title="Prioritize (process next)"
                          >
                            <ArrowUp size={11} /> Prioritize
                          </button>
                        </div>
                      ))}
                      {optimizeQueue.length > 5 && (
                        <button
                          className="btn"
                          style={{ 
                            width: '100%',
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            marginTop: '6px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px dashed var(--border-light)',
                            borderRadius: '4px',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            height: 'auto',
                            minHeight: 'auto'
                          }}
                          onClick={() => setIsQueueExpanded(!isQueueExpanded)}
                        >
                          {isQueueExpanded ? 'Show Less' : `Show all ${optimizeQueue.length} pending files...`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {filteredShows.length > 0 ? (
              <div className="show-grid">
                {filteredShows.map(show => {
                  const { watchedCount, inProgressCount } = getShowWatchStatus(show);
                  
                  return (
                    <div
                      key={show.id}
                      className="show-card"
                      onClick={() => setSelectedShow(show)}
                    >
                      <div className="show-cover-wrapper">
                        {show.hasCover ? (
                          <img 
                            className="show-cover" 
                            src={`/api/cover/${show.id}`} 
                            alt={show.name} 
                            loading="lazy"
                          />
                        ) : (
                          <div className="show-cover-fallback">
                            <Tv size={36} className="show-cover-fallback-icon" />
                            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', whiteSpace: 'nowrap', padding: '0 8px' }}>
                              {show.name}
                            </span>
                          </div>
                        )}
                        <span className="show-episode-count">
                          {show.episodes.length} EP
                        </span>
                      </div>
                      
                      <div className="show-info">
                        <h3 className="show-title" title={show.name}>
                          {show.name}
                        </h3>
                        
                        <div className="show-meta">
                          {watchedCount === show.episodes.length ? (
                            <span style={{ color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                              <CheckCircle2 size={13} /> Completed
                            </span>
                          ) : (watchedCount > 0 || inProgressCount > 0) ? (
                            <span style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                              <CircleDot size={13} /> Watching ({watchedCount}/{show.episodes.length})
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                              Unwatched
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Empty Library State */
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)', padding: '60px 20px', textAlign: 'center', marginTop: '20px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
                <AlertCircle size={48} style={{ color: 'var(--primary)', marginBottom: '16px', opacity: 0.8 }} />
                <h3 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>No Videos Found</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px', lineHeight: 1.5 }}>
                  {searchQuery 
                    ? 'No albums match your search query.'
                    : `We couldn't find any folders in the configured directory. Make sure you have subfolders containing video files (.mp4, .webm, .mkv).`}
                </p>
                
                {!searchQuery && (
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => setIsSettingsOpen(true)}
                    >
                      Configure Folder
                    </button>
                    <button 
                      className="btn" 
                      onClick={fetchLibrary}
                    >
                      <RefreshCw size={14} /> Check Again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        onRescan={handleRescan}
        currentSettings={settings}
      />

      {/* RSS Subscribe Modal */}
      <RssSubscribeModal
        isOpen={isRssModalOpen}
        onClose={() => setIsRssModalOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          fetchLibrary();
        }}
      />

      {/* Success/Toast Notification */}
      {toast && <div className="toast">{toast}</div>}

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
