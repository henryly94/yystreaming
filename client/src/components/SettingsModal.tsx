import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Globe, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';

interface Settings {
  videoDir: string;
  port: number;
  localIps: string[];
  qbHost?: string;
  qbPort?: number;
  qbUsername?: string;
  qbPassword?: string;
  qbPathPrefix?: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (videoDir: string, qbConfig?: { qbHost: string; qbPort: number; qbUsername: string; qbPassword: string; qbPathPrefix?: string }) => Promise<boolean>;
  onRescan: () => Promise<void>;
  currentSettings: Settings | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onRescan,
  currentSettings
}) => {
  const [videoDir, setVideoDir] = useState('');
  const [qbHost, setQbHost] = useState('127.0.0.1');
  const [qbPort, setQbPort] = useState(8080);
  const [qbUsername, setQbUsername] = useState('admin');
  const [qbPassword, setQbPassword] = useState('adminadmin');
  const [qbPathPrefix, setQbPathPrefix] = useState('');
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success?: boolean; msg: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleTestQb = async () => {
    setTestStatus({ loading: true, msg: 'Testing connection...' });
    try {
      const res = await fetch('/api/qbittorrent/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qbHost, qbPort, qbUsername, qbPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestStatus({ loading: false, success: true, msg: data.message });
      } else {
        setTestStatus({ loading: false, success: false, msg: data.error || 'Connection failed' });
      }
    } catch (e: any) {
      setTestStatus({ loading: false, success: false, msg: 'Network error: ' + e.message });
    }
  };

  const checkOptimizeStatus = async () => {
    try {
      const res = await fetch('/api/library/optimize/status');
      if (res.ok) {
        const data = await res.json();
        setIsOptimizing(data.isRunning);
      }
    } catch (e) {
      console.error('Error checking optimization status:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkOptimizeStatus();
      
      // Poll optimization status every 5 seconds if modal is open
      const interval = setInterval(checkOptimizeStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleOptimizeClick = async () => {
    setIsOptimizing(true);
    try {
      const res = await fetch('/api/library/optimize', { method: 'POST' });
      if (res.ok) {
        checkOptimizeStatus();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to start library optimization');
        setIsOptimizing(false);
      }
    } catch (err) {
      console.error('Error starting optimization:', err);
      alert('Error starting library optimization');
      setIsOptimizing(false);
    }
  };

  useEffect(() => {
    if (currentSettings) {
      setVideoDir(currentSettings.videoDir);
      if (currentSettings.qbHost) setQbHost(currentSettings.qbHost);
      if (currentSettings.qbPort) setQbPort(currentSettings.qbPort);
      if (currentSettings.qbUsername) setQbUsername(currentSettings.qbUsername);
      if (currentSettings.qbPassword) setQbPassword(currentSettings.qbPassword);
      if (currentSettings.qbPathPrefix) setQbPathPrefix(currentSettings.qbPathPrefix);
    }
  }, [currentSettings, isOpen]);

  // Generate QR Code for the primary local IP
  useEffect(() => {
    if (isOpen && currentSettings && currentSettings.localIps.length > 0 && canvasRef.current) {
      // Prioritize standard 192.168.x.x or 10.x.x.x IPs
      const primaryIp = currentSettings.localIps.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.')) || currentSettings.localIps[0];
      const url = `http://${primaryIp}:${window.location.port || '3000'}`;
      
      QRCode.toCanvas(
        canvasRef.current,
        url,
        {
          width: 180,
          margin: 1,
          color: {
            dark: '#0e1017',
            light: '#ffffff'
          }
        },
        (error) => {
          if (error) console.error('Error generating QR code:', error);
        }
      );
    }
  }, [isOpen, currentSettings]);

  if (!isOpen || !currentSettings) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const success = await onSave(videoDir, { qbHost, qbPort, qbUsername, qbPassword, qbPathPrefix });
    setIsSaving(false);
    if (success) {
      onClose();
    }
  };

  const handleRescanClick = async () => {
    setIsRescanning(true);
    await onRescan();
    setIsRescanning(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIp(text);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const primaryIp = currentSettings.localIps.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.')) || currentSettings.localIps[0];
  const primaryUrl = `http://${primaryIp}:${window.location.port || '3000'}`;

  const mouseDownOnOverlay = useRef(false);

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
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={24} />
        </button>

        <h2 className="modal-title">
          <Globe size={24} className="logo-text" style={{ background: 'none', WebkitTextFillColor: 'initial', color: 'var(--primary)' }} />
          Server Settings
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="video-dir">Video Library Path</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="video-dir"
                type="text"
                className="input-text"
                style={{ flexGrow: 1 }}
                value={videoDir}
                onChange={(e) => setVideoDir(e.target.value)}
                placeholder="e.g. C:\Users\Username\Videos"
                required
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Provide the absolute path to the directory containing your video folders.
            </span>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px' }}>
              qBittorrent Web UI Connection
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label className="form-label">Host</label>
                <input
                  type="text"
                  className="input-text"
                  value={qbHost}
                  onChange={(e) => setQbHost(e.target.value)}
                  placeholder="localhost"
                />
              </div>
              <div>
                <label className="form-label">Port</label>
                <input
                  type="number"
                  className="input-text"
                  value={qbPort}
                  onChange={(e) => setQbPort(parseInt(e.target.value, 10) || 8080)}
                  placeholder="8080"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="input-text"
                  value={qbUsername}
                  onChange={(e) => setQbUsername(e.target.value)}
                  placeholder="admin"
                />
              </div>
              <div>
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="input-text"
                  value={qbPassword}
                  onChange={(e) => setQbPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label className="form-label">qBittorrent Container Path (Docker Optional)</label>
              <input
                type="text"
                className="input-text"
                value={qbPathPrefix}
                onChange={(e) => setQbPathPrefix(e.target.value)}
                placeholder="e.g. /downloads"
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                If qBittorrent runs in Docker with <code style={{ color: 'var(--primary)' }}>-v /mnt/media_disk/downloads:/downloads</code>, set this to <code style={{ color: 'var(--primary)' }}>/downloads</code>.
              </span>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <button
                type="button"
                className="btn"
                onClick={handleTestQb}
                disabled={testStatus?.loading}
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              >
                {testStatus?.loading ? 'Testing...' : 'Test Connection'}
              </button>
              {testStatus && (
                <span style={{
                  fontSize: '0.78rem',
                  color: testStatus.success ? '#4ade80' : '#fca5a5',
                  fontWeight: 500
                }}>
                  {testStatus.msg}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save & Close'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleRescanClick}
                disabled={isRescanning}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <RefreshCw size={16} className={isRescanning ? 'spin' : ''} />
                {isRescanning ? 'Scanning...' : 'Rescan Library'}
              </button>
            </div>
            
            <button
              type="button"
              className="btn"
              onClick={handleOptimizeClick}
              disabled={isOptimizing}
              style={{ 
                justifyContent: 'center', 
                background: isOptimizing ? 'rgba(110, 68, 255, 0.1)' : 'rgba(255,255,255,0.03)',
                border: isOptimizing ? '1px dashed var(--primary)' : '1px solid var(--border-light)',
                color: isOptimizing ? 'var(--primary)' : 'white'
              }}
            >
              <RefreshCw size={16} className={isOptimizing ? 'spin' : ''} />
              {isOptimizing ? 'Optimizing Library (Background)...' : 'Optimize Library Now (Pre-Transcode)'}
            </button>
          </div>
        </form>

        {currentSettings.localIps.length > 0 && (
          <div className="qr-section">
            <h3 className="qr-title">Stream to Other Devices</h3>
            <p className="qr-subtitle">Scan the QR code with your phone or tablet on the same Wi-Fi network:</p>
            
            <div className="qr-container">
              <canvas ref={canvasRef} />
            </div>

            <div className="qr-ip-list">
              <div className="qr-ip-item">
                <span style={{ color: 'var(--text-muted)' }}>Network URL:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a href={primaryUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                    {primaryUrl}
                  </a>
                  <button 
                    className="player-btn" 
                    onClick={() => copyToClipboard(primaryUrl)}
                    style={{ padding: '4px' }}
                    title="Copy URL"
                  >
                    {copiedIp === primaryUrl ? <Check size={14} style={{ color: 'var(--secondary)' }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {currentSettings.localIps.length > 1 && (
                <details style={{ width: '100%', marginTop: '8px', cursor: 'pointer' }}>
                  <summary style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'left', padding: '4px 0' }}>
                    Show alternative IP addresses
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    {currentSettings.localIps.filter(ip => ip !== primaryIp).map(ip => {
                      const url = `http://${ip}:${window.location.port || '3000'}`;
                      return (
                        <div key={ip} className="qr-ip-item" style={{ border: 'none', background: 'rgba(255,255,255,0.01)', padding: '4px 6px' }}>
                          <span style={{ fontSize: '0.75rem' }}>{url}</span>
                          <button 
                            className="player-btn" 
                            onClick={() => copyToClipboard(url)}
                            style={{ padding: '2px' }}
                          >
                            {copiedIp === url ? <Check size={12} style={{ color: 'var(--secondary)' }} /> : <Copy size={12} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};
