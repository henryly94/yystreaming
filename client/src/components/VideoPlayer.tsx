import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, 
  Settings, SkipForward, Cast 
} from 'lucide-react';

interface VideoPlayerProps {
  episodeId: string;
  videoUrl: string;
  subtitleUrl: string | null;
  title: string;
  onNextEpisode?: () => void;
  hasNextEpisode?: boolean;
  durationMetadata?: number;
  onRetranscode?: () => void;
  isRetranscoding?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  episodeId,
  videoUrl,
  subtitleUrl,
  title: _title,
  onNextEpisode,
  hasNextEpisode = false,
  durationMetadata = 0,
  onRetranscode,
  isRetranscoding = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('yystreaming_volume');
    return saved ? parseFloat(saved) : 1;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMiddleIndicator, setShowMiddleIndicator] = useState<'play' | 'pause' | null>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);

  // Subtitle custom styles
  const [subSize, setSubSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [subColor, setSubColor] = useState<'white' | 'yellow' | 'green'>('white');

  // Dynamic seek states for transcoding
  const [streamStartTime, setStreamStartTime] = useState(0);
  const [activeVideoUrl, setActiveVideoUrl] = useState(videoUrl);

  // Chromecast & Remote Playback state
  const [castAvailable] = useState(() => {
    // @ts-ignore
    return !!window.chrome || /Safari/.test(navigator.userAgent);
  });
  const [isCasting, setIsCasting] = useState(false);

  // Autoplay settings state
  const [autoplayEnabled, setAutoplayEnabled] = useState(() => {
    const saved = localStorage.getItem('yystreaming_autoplay');
    return saved !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('yystreaming_autoplay', autoplayEnabled.toString());
  }, [autoplayEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    // @ts-ignore
    if (!video || !video.remote) return;

    const handleConnect = () => setIsCasting(true);
    const handleDisconnect = () => setIsCasting(false);

    // @ts-ignore
    video.remote.addEventListener('connect', handleConnect);
    // @ts-ignore
    video.remote.addEventListener('disconnect', handleDisconnect);

    return () => {
      // @ts-ignore
      video.remote.removeEventListener('connect', handleConnect);
      // @ts-ignore
      video.remote.removeEventListener('disconnect', handleDisconnect);
    };
  }, []);

  const handleCast = () => {
    const video = videoRef.current;
    if (!video) return;

    // 1. Safari / iOS / macOS AirPlay Target Picker
    // @ts-ignore
    if (typeof video.webkitShowPlaybackTargetPicker === 'function') {
      try {
        // @ts-ignore
        video.webkitShowPlaybackTargetPicker();
        return;
      } catch (err: any) {
        console.warn('AirPlay target picker failed:', err);
      }
    }

    // 2. Google Cast Framework (Chromecast SDK)
    // @ts-ignore
    if (window.cast && window.cast.framework) {
      try {
        // @ts-ignore
        const context = window.cast.framework.CastContext.getInstance();
        context.requestSession().then(
          () => console.log('Google Cast session started'),
          (err: any) => console.log('Cast session cancelled/failed:', err)
        );
        return;
      } catch (err: any) {
        console.warn('Cast framework request failed:', err);
      }
    }

    // 3. W3C Remote Playback API (Chrome / Android / Edge)
    // @ts-ignore
    if (video.remote && typeof video.remote.prompt === 'function') {
      // @ts-ignore
      video.remote.prompt()
        .then(() => {
          console.log('Remote playback prompt succeeded');
        })
        .catch((err: any) => {
          if (err.name === 'NotSupportedError') {
            alert("No Cast / AirPlay device (Chromecast, Smart TV, Apple TV) was found on your local Wi-Fi network, or casting is disabled in browser settings.");
          } else if (err.name !== 'AbortError') {
            alert("Casting failed: " + err.message);
          }
        });
      return;
    }

    alert("Casting is not supported on this device/browser. Please use Safari (for AirPlay) or Google Chrome (for Chromecast).");
  };

  // Load progress on mount or episode change
  // Stream Mode state for transcoding: 'remux' (Fast copy, 0 CPU) vs 'full' (Full re-encoding)
  const [streamMode, setStreamMode] = useState<'remux' | 'full'>('remux');
  const [streamNotice, setStreamNotice] = useState<string | null>(null);

  // Helper to build active transcode/stream URL
  const buildTranscodeUrl = (baseUrl: string, startOffset: number, mode: 'remux' | 'full') => {
    const targetUrl = baseUrl.includes('/transcode/') ? baseUrl : baseUrl.replace('/api/stream/', '/api/transcode/');
    const separator = targetUrl.includes('?') ? '&' : '?';
    let url = `${targetUrl}${separator}mode=${mode}`;
    if (startOffset > 2) {
      url += `&start=${startOffset}`;
    }
    return url;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset state
    setIsPlaying(false);
    setCurrentTime(0);
    setProgress(0);

    const isTranscoding = videoUrl.includes('/transcode/');
    const savedProgress = localStorage.getItem(`yystreaming_progress_${episodeId}`);
    let startOffset = 0;

    if (savedProgress) {
      try {
        const parsed = JSON.parse(savedProgress);
        if (parsed && typeof parsed.currentTime === 'number') {
          startOffset = parsed.currentTime;
        }
      } catch (e) {
        // Fallback if saved as plain number string
        const time = parseFloat(savedProgress);
        if (!isNaN(time)) {
          startOffset = time;
        }
      }
    }

    if (isTranscoding && startOffset > 2) {
      setStreamStartTime(startOffset);
      setActiveVideoUrl(buildTranscodeUrl(videoUrl, startOffset, streamMode));
    } else {
      setStreamStartTime(0);
      setActiveVideoUrl(buildTranscodeUrl(videoUrl, 0, streamMode));
    }

    const handleLoadedMetadata = () => {
      const dur = durationMetadata || video.duration;
      setDuration(dur);
      
      // Seek on direct play
      if (!isTranscoding && startOffset > 2 && startOffset < video.duration - 5) {
        video.currentTime = startOffset;
      }
    };

    const handleError = () => {
      if (isTranscoding && streamMode === 'remux') {
        console.warn('[VideoPlayer]: Remux stream playback failed. Auto-fallback to Full Transcode compatibility mode.');
        setStreamNotice('⚠️ Browser cannot decode H.265 directly. Switched to Full Transcode mode.');
        setTimeout(() => setStreamNotice(null), 5000);
        setStreamMode('full');
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [episodeId, videoUrl, durationMetadata, streamMode]);

  // Sync activeVideoUrl changes (reloads transcode stream on seek)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.src && activeVideoUrl) {
      const absoluteActiveUrl = activeVideoUrl.startsWith('http')
        ? activeVideoUrl
        : `${window.location.origin}${activeVideoUrl}`;

      if (video.src !== absoluteActiveUrl) {
        video.load();
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(err => console.error("Error seeking transcode stream:", err));
      }
    }
  }, [activeVideoUrl]);

  // Volume synchronization
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem('yystreaming_volume', volume.toString());
  }, [volume, isMuted]);

  // Save progress periodically
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const elapsed = streamStartTime + video.currentTime;
      setCurrentTime(elapsed);
      setProgress(duration ? (elapsed / duration) * 100 : 0);
      
      // Save progress if we watched more than 2 seconds
      if (elapsed > 2) {
        const progressObj = {
          currentTime: elapsed,
          duration: duration,
          percentage: duration ? (elapsed / duration) * 100 : 0
        };
        localStorage.setItem(`yystreaming_progress_${episodeId}`, JSON.stringify(progressObj));
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      localStorage.removeItem(`yystreaming_progress_${episodeId}`); // Clean up finished progress
      if (autoplayEnabled && hasNextEpisode && onNextEpisode) {
        onNextEpisode();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [episodeId, duration, streamStartTime, hasNextEpisode, onNextEpisode, autoplayEnabled]);

  // Handle Play/Pause
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      triggerMiddleIndicator('pause');
    } else {
      video.play().then(() => {
        setIsPlaying(true);
        triggerMiddleIndicator('play');
      }).catch(err => console.error("Error playing video:", err));
    }
  };

  const triggerMiddleIndicator = (type: 'play' | 'pause') => {
    setShowMiddleIndicator(type);
    setTimeout(() => setShowMiddleIndicator(null), 500);
  };

  // Skip progress
  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const elapsed = streamStartTime + video.currentTime;
    const newTime = Math.max(0, Math.min(duration, elapsed + seconds));
    
    const isTranscoding = videoUrl.includes('/transcode/');
    if (isTranscoding) {
      setStreamStartTime(newTime);
      setActiveVideoUrl(buildTranscodeUrl(videoUrl, newTime, streamMode));
    } else {
      video.currentTime = newTime;
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(prev => Math.min(1, prev + 0.05));
          setIsMuted(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(prev => Math.max(0, prev - 0.05));
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          setIsMuted(prev => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, volume, isMuted]);

  // Autohide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    
    // Only autohide if playing
    if (isPlaying && !showSettings) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
    }
  }, [isPlaying]);

  // Fullscreen management
  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    // Detect if we are already in fullscreen
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement ||
      isFullscreen
    );

    if (!isCurrentlyFullscreen) {
      // Enter Fullscreen
      if (container.requestFullscreen) {
        container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
        setIsFullscreen(true);
      } else if ((container as any).mozRequestFullScreen) {
        (container as any).mozRequestFullScreen();
        setIsFullscreen(true);
      } else if ((container as any).msRequestFullscreen) {
        (container as any).msRequestFullscreen();
        setIsFullscreen(true);
      } else if (typeof (video as any).webkitEnterFullscreen === 'function') {
        // Fallback for iOS iPhone Safari
        try {
          (video as any).webkitEnterFullscreen();
          setIsFullscreen(true);
        } catch (err) {
          console.error("iOS webkitEnterFullscreen error:", err);
        }
      }
    } else {
      // Exit Fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
        setIsFullscreen(false);
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
        setIsFullscreen(false);
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
        setIsFullscreen(false);
      } else if (typeof (video as any).webkitExitFullscreen === 'function') {
        try {
          (video as any).webkitExitFullscreen();
          setIsFullscreen(false);
        } catch (err) {}
      } else {
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullscreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    const video = videoRef.current;
    const handleWebKitBeginFullscreen = () => setIsFullscreen(true);
    const handleWebKitEndFullscreen = () => setIsFullscreen(false);

    if (video) {
      video.addEventListener('webkitbeginfullscreen', handleWebKitBeginFullscreen);
      video.addEventListener('webkitendfullscreen', handleWebKitEndFullscreen);
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      if (video) {
        video.removeEventListener('webkitbeginfullscreen', handleWebKitBeginFullscreen);
        video.removeEventListener('webkitendfullscreen', handleWebKitEndFullscreen);
      }
    };
  }, []);

  // Format time (MM:SS or HH:MM:SS)
  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return '0:00';
    const hrs = Math.floor(timeInSeconds / 3600);
    const mins = Math.floor((timeInSeconds % 3600) / 60);
    const secs = Math.floor(timeInSeconds % 60);

    const formattedSecs = secs < 10 ? `0${secs}` : secs;

    if (hrs > 0) {
      const formattedMins = mins < 10 ? `0${mins}` : mins;
      return `${hrs}:${formattedMins}:${formattedSecs}`;
    }
    return `${mins}:${formattedSecs}`;
  };

  // Handle timeline seek clicking
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;

    const isTranscoding = videoUrl.includes('/transcode/');
    if (isTranscoding) {
      setStreamStartTime(newTime);
      setActiveVideoUrl(buildTranscodeUrl(videoUrl, newTime, streamMode));
    } else {
      video.currentTime = newTime;
      setProgress(percentage * 100);
    }
  };

  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  // Sync track element based on subtitle toggle
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const track = video.textTracks[0];
    if (track) {
      track.mode = subtitlesEnabled ? 'showing' : 'hidden';
    }
  }, [subtitlesEnabled, subtitleUrl]);

  return (
    <div 
      ref={containerRef}
      className={`custom-player-wrapper ${isPlaying ? 'playing' : 'paused'} cue-size-${subSize} cue-color-${subColor}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {isRetranscoding && (
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(234, 179, 8, 0.4)',
          borderRadius: '20px',
          padding: '6px 16px',
          color: '#fde047',
          fontSize: '0.8rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          pointerEvents: 'none'
        }}>
          <span className="spin" style={{ width: '10px', height: '10px', border: '2px solid rgba(254, 224, 71, 0.3)', borderTopColor: '#fde047', borderRadius: '50%' }}></span>
          Re-transcoding in background... (Playback active)
        </div>
      )}

      <video
        ref={videoRef}
        src={activeVideoUrl}
        className="native-video"
        onClick={togglePlay}
        playsInline
        // @ts-ignore
        x-webkit-airplay="allow"
      >
        {subtitleUrl && (
          <track
            key={subtitleUrl}
            src={subtitleUrl}
            kind="subtitles"
            srcLang="zh"
            label="Default"
            default={subtitlesEnabled}
          />
        )}
      </video>

      {/* Stream Notice Toast */}
      {streamNotice && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          color: '#e2e8f0',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '0.82rem',
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
          fontWeight: 500
        }}>
          {streamNotice}
        </div>
      )}

      {/* Middle Big Click Playback Indicator */}
      <div className={`mid-play-indicator ${showMiddleIndicator ? 'trigger' : ''}`}>
        {showMiddleIndicator === 'play' ? <Play size={32} fill="white" /> : <Pause size={32} fill="white" />}
      </div>

      {/* Controls Overlay */}
      <div 
        className="player-controls-overlay"
        style={{ opacity: showControls ? 1 : 0 }}
      >
        {/* Progress Slider */}
        <div className="timeline-container" onClick={handleTimelineClick}>
          <div className="timeline-bar">
            <div className="timeline-progress" style={{ width: `${progress}%` }}></div>
            <div className="timeline-handle" style={{ left: `${progress}%` }}></div>
          </div>
        </div>

        <div className="controls-row">
          <div className="controls-group">
            {/* Play/Pause */}
            <button className="player-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} />}
            </button>

            {/* Next Episode Button */}
            {hasNextEpisode && onNextEpisode && (
              <button className="player-btn" onClick={onNextEpisode} title="Next Episode">
                <SkipForward fill="currentColor" size={18} />
              </button>
            )}

            {/* Time display */}
            <div className="time-display">
              {formatTime(currentTime)} <span style={{ opacity: 0.5 }}>/</span> {formatTime(duration)}
            </div>

            {/* Volume controls */}
            <div className="volume-container">
              <button className="player-btn" onClick={() => setIsMuted(!isMuted)}>
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(parseFloat(e.target.value));
                  setIsMuted(false);
                }}
                className="volume-slider"
              />
            </div>
          </div>

          <div className="controls-group">
            {/* Subtitle Toggle */}
            {subtitleUrl && (
              <button 
                className="player-btn badge" 
                onClick={() => setSubtitlesEnabled(prev => !prev)}
                style={{ 
                  background: subtitlesEnabled ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                  color: 'white',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontWeight: 600
                }}
              >
                SUB
              </button>
            )}

            {/* Playback rate select */}
            <div className="speed-selector-row" style={{ display: 'flex', gap: '4px' }}>
              {[1, 1.25, 1.5, 2].map(speed => (
                <button
                  key={speed}
                  className="player-btn"
                  onClick={() => handleSpeedChange(speed)}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: playbackRate === speed ? 'bold' : 'normal',
                    color: playbackRate === speed ? 'var(--primary)' : 'rgba(255,255,255,0.7)',
                    padding: '2px 4px'
                  }}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Settings popover toggle (unconditionally rendered for speed + subtitles) */}
            <div style={{ position: 'relative' }}>
              <button className="player-btn" onClick={() => setShowSettings(!showSettings)} title="Playback Settings">
                <Settings size={18} />
              </button>

              {showSettings && (
                <div className="subtitle-settings-popover">
                  {/* Playback Speed Option */}
                  <div className="subtitle-setting-item">
                    <div className="subtitle-setting-label">Playback Speed</div>
                    <div className="subtitle-select-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                      {[1, 1.25, 1.5, 2].map(speed => (
                        <button
                          key={speed}
                          className={`subtitle-select-btn ${playbackRate === speed ? 'active' : ''}`}
                          onClick={() => handleSpeedChange(speed)}
                          style={{ padding: '4px 0' }}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-Play Next Toggle */}
                  <div className="subtitle-setting-item">
                    <div className="subtitle-setting-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '4px' }}>
                      <span>Auto-Play Next</span>
                      <button
                        type="button"
                        className={`subtitle-select-btn ${autoplayEnabled ? 'active' : ''}`}
                        onClick={() => setAutoplayEnabled(!autoplayEnabled)}
                        style={{ padding: '2px 10px', fontSize: '0.75rem', width: 'auto', minWidth: '50px', height: '24px', lineHeight: '20px' }}
                      >
                        {autoplayEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>

                  {/* Stream Engine Mode */}
                  <div className="subtitle-setting-item">
                    <div className="subtitle-setting-label">Playback Engine (播放引擎)</div>
                    <div className="subtitle-select-grid">
                      <button
                        type="button"
                        className={`subtitle-select-btn ${streamMode === 'remux' ? 'active' : ''}`}
                        onClick={() => {
                          setStreamMode('remux');
                          setStreamNotice('⚡ Switched to Direct Remux (0% CPU, 100% Quality)');
                          setTimeout(() => setStreamNotice(null), 3000);
                        }}
                        style={{ fontSize: '0.72rem' }}
                        title="Direct Remux: 0% CPU, instant start, lossy-free pixel copy"
                      >
                        ⚡ 极速直推 (Remux)
                      </button>
                      <button
                        type="button"
                        className={`subtitle-select-btn ${streamMode === 'full' ? 'active' : ''}`}
                        onClick={() => {
                          setStreamMode('full');
                          setStreamNotice('⚙️ Switched to Full Transcode (H.264 Compatibility Mode)');
                          setTimeout(() => setStreamNotice(null), 3000);
                        }}
                        style={{ fontSize: '0.72rem' }}
                        title="Full Transcode: Re-encode to H.264 for maximum browser compatibility"
                      >
                        ⚙️ 兼容转码 (Full)
                      </button>
                    </div>
                  </div>

                  {/* Re-transcode Option */}
                  {onRetranscode && (
                    <div className="subtitle-setting-item">
                      <div className="subtitle-setting-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '4px' }}>
                        <span>Re-transcode Subtitles</span>
                        <button
                          type="button"
                          className="subtitle-select-btn"
                          onClick={() => {
                            onRetranscode();
                            setShowSettings(false);
                          }}
                          style={{ padding: '2px 10px', fontSize: '0.75rem', width: 'auto', minWidth: '85px', height: '24px', lineHeight: '20px' }}
                        >
                          {isRetranscoding ? 'Queued...' : 'Re-transcode'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Subtitle Customizations (Only shown if subtitle is available) */}
                  {subtitleUrl && (
                    <>
                      <div className="subtitle-setting-item">
                        <div className="subtitle-setting-label">Subtitle Size</div>
                        <div className="subtitle-select-grid">
                          {(['sm', 'md', 'lg'] as const).map(size => (
                            <button
                              key={size}
                              className={`subtitle-select-btn ${subSize === size ? 'active' : ''}`}
                              onClick={() => setSubSize(size)}
                            >
                              {size.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="subtitle-setting-item">
                        <div className="subtitle-setting-label">Subtitle Color</div>
                        <div className="subtitle-select-grid">
                          {(['white', 'yellow', 'green'] as const).map(color => (
                            <button
                              key={color}
                              className={`subtitle-select-btn ${subColor === color ? 'active' : ''}`}
                              onClick={() => setSubColor(color)}
                            >
                              {color.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <button 
                    className="btn btn-primary"
                    style={{ fontSize: '0.75rem', padding: '6px', justifyContent: 'center' }}
                    onClick={() => setShowSettings(false)}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* Cast / Chromecast toggle */}
            {castAvailable && (
              <button 
                className="player-btn" 
                onClick={handleCast} 
                title={isCasting ? "Stop Casting" : "Cast to TV"}
                style={{ color: isCasting ? 'var(--primary)' : 'white' }}
              >
                <Cast size={18} />
              </button>
            )}

            {/* Fullscreen toggle */}
            <button className="player-btn" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Embedded CSS for subtitle size/color override */}
      <style>{`
        .cue-size-sm ::cue { font-size: 0.85rem !important; }
        .cue-size-md ::cue { font-size: 1.1rem !important; }
        .cue-size-lg ::cue { font-size: 1.4rem !important; }
        .cue-color-white ::cue { color: #ffffff !important; }
        .cue-color-yellow ::cue { color: #fef08a !important; }
        .cue-color-green ::cue { color: #86efac !important; }
      `}</style>
    </div>
  );
};
