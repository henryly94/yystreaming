import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { cleanShowName, deduplicateAndFilterRssItems } from './rss_parser.js';
import { QBittorrentClient } from './qbittorrent.js';
import { searchMikanAnime, getMikanBangumiDetails } from './mikan_search.js';
import { searchTmdb, getTmdbShowDetails } from './tmdb.js';
import { searchUniversalMediaTorrents } from './tv_search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the path to FFmpeg dynamically (handles freshly installed WinGet path changes)
let ffmpegCmd = 'ffmpeg';

function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegCmd = 'ffmpeg';
    return true;
  } catch (e) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const wingetPath = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe');
    if (fs.existsSync(wingetPath)) {
      ffmpegCmd = wingetPath;
      return true;
    }
    return false;
  }
}

// Initialize FFmpeg path resolution immediately on startup
checkFfmpeg();

// Get the duration of a video file using ffprobe
function getVideoDuration(filePath) {
  try {
    let ffprobeCmd = 'ffprobe';
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const wingetPath = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffprobe.exe');
    if (fs.existsSync(wingetPath)) {
      ffprobeCmd = wingetPath;
    }
    
    const stdout = execSync(`"${ffprobeCmd}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    const duration = parseFloat(stdout.toString().trim());
    return isNaN(duration) ? 0 : duration;
  } catch (e) {
    console.error('Error getting duration with ffprobe:', e);
    return 0;
  }
}

// Metadata Cache System for scanLibrary to prevent blocking synchronous ffprobe calls on refresh
const METADATA_CACHE_FILE = path.join(__dirname, 'library_metadata_cache.json');
let metadataCache = {};
let isMetadataCacheLoaded = false;

function loadMetadataCache() {
  if (isMetadataCacheLoaded) return;
  if (fs.existsSync(METADATA_CACHE_FILE)) {
    try {
      metadataCache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8'));
      isMetadataCacheLoaded = true;
    } catch (e) {
      console.error('Error reading metadata cache, using empty cache:', e);
      metadataCache = {};
    }
  } else {
    isMetadataCacheLoaded = true;
  }
}

function saveMetadataCache() {
  try {
    fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(metadataCache, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving metadata cache:', e);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const DEFAULT_PORT = 5001;

// Load or create default settings
function getSettings() {
  let settings = {
    videoDir: '',
    port: DEFAULT_PORT,
    tmdbApiKey: ''
  };

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      settings = { ...settings, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error reading settings file, using defaults:', err);
  }

  // Set default directory if empty
  if (!settings.videoDir) {
    settings.videoDir = path.join(os.homedir(), 'yystreaming_videos');
  }

  // Ensure the directory exists
  if (!fs.existsSync(settings.videoDir)) {
    try {
      fs.mkdirSync(settings.videoDir, { recursive: true });
      console.log(`Created default video directory: ${settings.videoDir}`);
    } catch (err) {
      console.error(`Failed to create default video directory: ${settings.videoDir}`, err);
    }
  }

  return settings;
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving settings file:', err);
  }
}

// Security helper: verify paths are within the root video directory
function getSafePath(videoDir, relPath) {
  const resolvedRoot = path.resolve(videoDir);
  const resolvedTarget = path.resolve(videoDir, relPath);
  
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error('Access Denied: Path traversal detected');
  }
  return resolvedTarget;
}

// Helper to translate host showDir to qBittorrent Docker container path
function getQbSavePath(showDir, settings) {
  if (settings && settings.qbPathPrefix && settings.videoDir) {
    const rel = path.relative(settings.videoDir, showDir);
    return path.posix.join(settings.qbPathPrefix.trim(), rel.replace(/\\/g, '/'));
  }
  return showDir;
}

// Find local network IP addresses
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// Recursively find files in a directory
function findFilesRecursively(dirPath, relativeToDir) {
  let results = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFilesRecursively(fullPath, relativeToDir));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const relativePath = path.relative(relativeToDir, fullPath);
        results.push({
          fileName: entry.name,
          ext,
          absolutePath: fullPath,
          relativePath
        });
      }
    }
  } catch (err) {
    console.error(`Error reading directory recursively: ${dirPath}`, err);
  }
  return results;
}

// Scan video directory
function scanLibrary(videoDir) {
  if (!fs.existsSync(videoDir)) {
    return [];
  }

  loadMetadataCache();
  let cacheUpdated = false;
  const shows = [];
  try {
    const entries = fs.readdirSync(videoDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const showDirName = entry.name;
        const showPath = path.join(videoDir, showDirName);
        const showId = Buffer.from(showDirName).toString('hex');
        
        // Recursively gather all files inside the show directory
        const allFiles = findFilesRecursively(showPath, showPath);
        const videoFiles = [];
        const subtitleFiles = new Map();
        let coverFile = null;

        for (const file of allFiles) {
          const ext = file.ext;
          const nameWithoutExt = path.basename(file.fileName, ext);
          const relPathNormalized = file.relativePath.replace(/\\/g, '/');

            if (['.mp4', '.webm', '.mkv', '.mov', '.avi'].includes(ext)) {
              // Include video file even if currently downloading
              videoFiles.push({ 
                name: file.fileName, 
                nameWithoutExt, 
                ext, 
                path: file.absolutePath,
                relativePath: relPathNormalized
              });
            } else if (['.srt', '.vtt', '.ass', '.ssa'].includes(ext)) {
            // Index subtitle by its normalized relative path without extension, stripping language tags
            const relPathNoExt = relPathNormalized.slice(0, -ext.length).toLowerCase();
            const strippedKey = relPathNoExt.replace(/\.(chs|cht|zh-hans|zh-hant|zh-cn|zh-tw|zh-hk|zh|eng|en|chi|zho)$/i, '');
            subtitleFiles.set(strippedKey, { name: file.fileName, ext, path: file.absolutePath });
          } else if (['cover.jpg', 'cover.png', 'poster.jpg', 'poster.png', 'folder.jpg', 'folder.png'].includes(file.fileName.toLowerCase())) {
            // Prioritize root-level covers, fallback to nested covers
            const isRootLevel = !relPathNormalized.includes('/');
            if (isRootLevel || !coverFile) {
              coverFile = file.absolutePath;
            }
          }
        }

        // If no official cover file, look for any image files
        if (!coverFile) {
          const imageFile = allFiles.find(file => {
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(file.ext);
          });
          if (imageFile) {
            coverFile = imageFile.absolutePath;
          }
        }

        // Sort video files alphabetically (natural sort order by relative path)
        videoFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));

        // Filter out raw MKV/AVI/MOV files if a converted MP4 version exists with the same base name
        const filteredVideoFiles = [];
        const mp4Paths = new Set(
          videoFiles.filter(v => v.ext === '.mp4').map(v => v.relativePath.slice(0, -4).toLowerCase())
        );

        for (const video of videoFiles) {
          const baseRelPath = video.relativePath.slice(0, -video.ext.length).toLowerCase();
          if (['.mkv', '.avi', '.mov'].includes(video.ext) && mp4Paths.has(baseRelPath)) {
            // Hide the original raw format file from the web UI
            continue;
          }
          filteredVideoFiles.push(video);
        }

        const episodes = [];
        for (const video of filteredVideoFiles) {
          const relPath = path.join(showDirName, video.relativePath);
          const episodeId = Buffer.from(relPath).toString('hex');
          
          // Match subtitle by relative path without extension, stripping language tags
          const relPathNoExt = video.relativePath.slice(0, -video.ext.length).toLowerCase();
          const strippedKey = relPathNoExt.replace(/\.(chs|cht|zh-hans|zh-hant|zh-cn|zh-tw|zh-hk|zh|eng|en|chi|zho)$/i, '');
          const matchingSub = subtitleFiles.get(strippedKey);

          // Extract episode number for friendly display badge
          let epBadge = '';
          const cnM = video.name.match(/第\s*(\d{1,4}(?:\.5)?)\s*(?:v\d+)?\s*[集話话]/i);
          if (cnM) {
            epBadge = `EP ${cnM[1].padStart(2, '0')} · `;
          } else {
            const epM = video.name.match(/(?:S\d+\s*)?E(?:P)?\s*(\d{1,4}(?:\.5)?)\b/i);
            if (epM) {
              epBadge = `EP ${epM[1].padStart(2, '0')} · `;
            } else {
              const bracketMatches = [...video.name.matchAll(/(?:\[|【)\s*(\d{1,3}(?:\.5)?)(?:v\d+)?\s*(?:\]|】)/g)];
              for (const m of bracketMatches) {
                const n = parseInt(m[1], 10);
                if (n !== 1080 && n !== 720 && n !== 2160 && n !== 4 && n !== 264 && n !== 265) {
                  epBadge = `EP ${m[1].padStart(2, '0')} · `;
                  break;
                }
              }
            }
          }

          // Build a friendly display name including subfolders (e.g. "EP 01 · [Sakurato] Episode 1")
          const displayName = `${epBadge}${video.relativePath.slice(0, -video.ext.length)}`;

          let duration = 0;
          try {
            const stat = fs.statSync(video.path);
            const cacheKey = video.path;
            const cached = metadataCache[cacheKey];

            if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
              duration = cached.duration;
            } else {
              duration = getVideoDuration(video.path);
              metadataCache[cacheKey] = {
                duration,
                mtime: stat.mtimeMs,
                size: stat.size
              };
              cacheUpdated = true;
            }
          } catch (statErr) {
            console.error(`Error resolving duration for ${video.name}:`, statErr.message);
          }

          episodes.push({
            id: episodeId,
            name: displayName,
            fileName: video.name,
            hasSubtitle: !!matchingSub,
            subtitleExt: matchingSub ? matchingSub.ext : null,
            duration: duration
          });
        }

        if (episodes.length > 0 || coverFile || allFiles.some(f => f.fileName.includes('.!qB'))) {
          shows.push({
            id: showId,
            name: showDirName,
            hasCover: !!coverFile,
            coverExt: coverFile ? path.extname(coverFile) : null,
            episodes
          });
        }
      }
    }
  } catch (err) {
    console.error('Error scanning library directory:', err);
  }

  // Sort shows alphabetically
  shows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  if (cacheUpdated) {
    saveMetadataCache();
  }
  return shows;
}

// --- API Routes ---

// Get current settings and network info
app.get('/api/settings', (req, res) => {
  const settings = getSettings();
  res.json({
    videoDir: settings.videoDir,
    port: settings.port,
    qbHost: settings.qbHost || '127.0.0.1',
    qbPort: settings.qbPort || 8080,
    qbUsername: settings.qbUsername || 'admin',
    qbPassword: settings.qbPassword || '',
    qbPathPrefix: settings.qbPathPrefix || '',
    autoRemoveTorrents: settings.autoRemoveTorrents ?? false,
    retentionHours: settings.retentionHours ?? 72,
    ratioLimit: settings.ratioLimit ?? 1.5,
    deleteOnIngest: settings.deleteOnIngest ?? false,
    localIps: getLocalIps(),
    ffmpegAvailable: checkFfmpeg()
  });
});

// Update settings
app.post('/api/settings', (req, res) => {
  const { videoDir, qbHost, qbPort, qbUsername, qbPassword, qbPathPrefix, autoRemoveTorrents, retentionHours, ratioLimit, deleteOnIngest } = req.body;
  if (!videoDir) {
    return res.status(400).json({ error: 'videoDir is required' });
  }

  // Try parsing path & resolving
  const resolvedPath = path.resolve(videoDir);
  
  // Ensure path exists or create it
  if (!fs.existsSync(resolvedPath)) {
    try {
      fs.mkdirSync(resolvedPath, { recursive: true });
    } catch (err) {
      return res.status(400).json({ error: `Cannot create or access directory: ${err.message}` });
    }
  }

  const settings = getSettings();
  settings.videoDir = resolvedPath;
  if (qbHost !== undefined) settings.qbHost = qbHost;
  if (qbPort !== undefined) settings.qbPort = parseInt(qbPort, 10) || 8080;
  if (qbUsername !== undefined) settings.qbUsername = qbUsername;
  if (qbPassword !== undefined) settings.qbPassword = qbPassword;
  if (qbPathPrefix !== undefined) settings.qbPathPrefix = qbPathPrefix;
  if (autoRemoveTorrents !== undefined) settings.autoRemoveTorrents = !!autoRemoveTorrents;
  if (retentionHours !== undefined) settings.retentionHours = parseFloat(retentionHours) || 72;
  if (ratioLimit !== undefined) settings.ratioLimit = parseFloat(ratioLimit) || 1.5;
  if (deleteOnIngest !== undefined) settings.deleteOnIngest = !!deleteOnIngest;

  saveSettings(settings);

  res.json({
    success: true,
    videoDir: settings.videoDir,
    port: settings.port,
    qbHost: settings.qbHost,
    qbPort: settings.qbPort,
    qbUsername: settings.qbUsername,
    qbPathPrefix: settings.qbPathPrefix,
    autoRemoveTorrents: settings.autoRemoveTorrents,
    retentionHours: settings.retentionHours,
    ratioLimit: settings.ratioLimit,
    deleteOnIngest: settings.deleteOnIngest,
    localIps: getLocalIps(),
    ffmpegAvailable: checkFfmpeg()
  });
});

// Test qBittorrent connection & credentials
app.post('/api/qbittorrent/test', async (req, res) => {
  try {
    const settings = getSettings();
    const config = {
      qbHost: req.body.qbHost || settings.qbHost,
      qbPort: req.body.qbPort || settings.qbPort,
      qbUsername: req.body.qbUsername || settings.qbUsername,
      qbPassword: req.body.qbPassword || settings.qbPassword
    };

    const qb = new QBittorrentClient(config);
    const testResult = await qb.testConnection();

    if (testResult.success) {
      return res.json({ success: true, message: `Connected to qBittorrent (${testResult.version})` });
    } else {
      return res.status(400).json({ success: false, error: testResult.error });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get catalog lists
app.get('/api/library', (req, res) => {
  const settings = getSettings();
  const library = scanLibrary(settings.videoDir);
  res.json(library);
});

// Trigger library optimization manually
app.post('/api/library/optimize', (req, res) => {
  if (isPreprocessing) {
    return res.status(400).json({ error: 'Optimization job is already running.' });
  }
  spawnPreprocessJob();
  res.json({ message: 'Optimization job started in the background.' });
});

// Check library optimization status
app.get('/api/library/optimize/status', (req, res) => {
  res.json({ isRunning: isPreprocessing });
});

// Check library optimization progress details
app.get('/api/library/optimize/progress', (req, res) => {
  const statusFile = path.join(__dirname, 'preprocess_status.json');
  if (fs.existsSync(statusFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      // Keep isRunning flag in sync with server's active state
      data.isRunning = isPreprocessing;
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read optimization progress' });
    }
  }
  res.json({ isRunning: isPreprocessing, currentFile: null });
});

// Get optimization queue
app.get('/api/library/optimize/queue', (req, res) => {
  const queueFile = path.join(__dirname, 'preprocess_queue.json');
  if (fs.existsSync(queueFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read optimization queue' });
    }
  }
  res.json([]);
});

// Prioritize an item in the optimization queue
app.post('/api/library/optimize/queue/prioritize', (req, res) => {
  const { absolutePath } = req.body;
  if (!absolutePath) {
    return res.status(400).json({ error: 'absolutePath is required' });
  }

  const queueFile = path.join(__dirname, 'preprocess_queue.json');
  if (!fs.existsSync(queueFile)) {
    return res.status(404).json({ error: 'Optimization queue is empty or not initialized' });
  }

  try {
    let queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    
    // Find the item
    const itemIndex = queue.findIndex(item => item.absolutePath === absolutePath);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found in optimization queue' });
    }

    const item = queue[itemIndex];
    // Remove from current position
    queue.splice(itemIndex, 1);
    // Move to the very beginning (index 0) so it is the next file picked up!
    queue.unshift(item);

    fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2), 'utf8');
    res.json({ success: true, message: `Moved ${item.fileName} to the top of the queue`, queue });
  } catch (e) {
    console.error('Error prioritizing queue item:', e);
    res.status(500).json({ error: 'Failed to update optimization queue' });
  }
});

// Manually queue an episode for re-transcoding (Zero downtime)
app.post('/api/library/optimize/retranscode', (req, res) => {
  const { videoPath, episodeId } = req.body;
  const settings = getSettings();
  
  let targetPath = videoPath;
  if (!targetPath && episodeId) {
    try {
      const relPath = Buffer.from(episodeId, 'hex').toString('utf-8');
      targetPath = getSafePath(settings.videoDir, relPath);
    } catch (e) {}
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    return res.status(400).json({ error: 'Valid videoPath or episodeId is required' });
  }

  try {
    const queueFile = path.join(__dirname, 'preprocess_queue.json');
    let queue = [];
    if (fs.existsSync(queueFile)) {
      try {
        queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
      } catch (e) {
        queue = [];
      }
    }

    const dir = path.dirname(targetPath);
    const fileName = path.basename(targetPath);
    const ext = path.extname(fileName).toLowerCase();
    const baseName = fileName.slice(0, -ext.length);

    // If target is an .mp4, resolve the original source video (.mkv, .avi, etc.) if available
    let sourcePath = targetPath;
    let sourceFileName = fileName;
    let sourceExt = ext;
    let sourceBaseName = baseName;

    if (ext === '.mp4') {
      const candidates = ['.mkv', '.avi', '.mov', '.webm'];
      for (const candExt of candidates) {
        const candPath = path.join(dir, baseName + candExt);
        if (fs.existsSync(candPath)) {
          sourcePath = candPath;
          sourceFileName = baseName + candExt;
          sourceExt = candExt;
          break;
        }
      }
    }

    const queueItem = {
      absolutePath: sourcePath,
      directory: dir,
      fileName: sourceFileName,
      baseName: sourceBaseName,
      ext: sourceExt
    };

    // Remove if already in queue to avoid duplicate entries
    queue = queue.filter(item => item.absolutePath !== sourcePath);
    // Unshift to top priority (index 0)
    queue.unshift(queueItem);

    fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2), 'utf8');

    // Trigger preprocessor job immediately
    spawnPreprocessJob();

    return res.json({ 
      success: true, 
      message: `Queued ${sourceFileName} for re-transcoding`, 
      queueItem 
    });
  } catch (e) {
    console.error('Error queuing item for re-transcoding:', e);
    return res.status(500).json({ error: 'Failed to queue item for re-transcoding' });
  }
});

// Serve cover image for a show
app.get('/api/cover/:showId', (req, res) => {
  const settings = getSettings();
  const { showId } = req.params;

  try {
    const showDirName = Buffer.from(showId, 'hex').toString('utf-8');
    const safeShowPath = getSafePath(settings.videoDir, showDirName);

    if (fs.existsSync(safeShowPath)) {
      const files = fs.readdirSync(safeShowPath);
      // Search for cover images
      const coverFile = files.find(file => {
        return ['cover.jpg', 'cover.png', 'poster.jpg', 'poster.png', 'folder.jpg', 'folder.png'].includes(file.toLowerCase());
      }) || files.find(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
      });

      if (coverFile) {
        return res.sendFile(path.join(safeShowPath, coverFile));
      }
    }
  } catch (err) {
    console.error('Error serving cover:', err);
  }

  res.status(404).send('Cover not found');
});

// Stream video file (handles Range requests for seeking)
app.get('/api/stream/:episodeId', (req, res) => {
  const settings = getSettings();
  const { episodeId } = req.params;

  try {
    const relPath = Buffer.from(episodeId, 'hex').toString('utf-8');
    const safeVideoPath = getSafePath(settings.videoDir, relPath);

    if (!fs.existsSync(safeVideoPath)) {
      return res.status(404).send('Video not found');
    }

    const stat = fs.statSync(safeVideoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Detect MIME type based on file extension
    const ext = path.extname(safeVideoPath).toLowerCase();
    let contentType = 'video/mp4';
    if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.mkv') contentType = 'video/x-matroska';
    else if (ext === '.mov') contentType = 'video/quicktime';
    else if (ext === '.avi') contentType = 'video/x-msvideo';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
        return;
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(safeVideoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      };
      res.writeHead(200, head);
      fs.createReadStream(safeVideoPath).pipe(res);
    }
  } catch (err) {
    console.error('Error streaming video:', err);
    res.status(500).send('Internal server error');
  }
});

const activeTranscodeProcesses = new Map();

// Transcode video on-the-fly to H.264/AAC Fragmented MP4 for browser playability
app.get('/api/transcode/:episodeId', (req, res) => {
  const settings = getSettings();
  const { episodeId } = req.params;
  const startTime = parseFloat(req.query.start) || 0;
  const range = req.headers.range;

  try {
    const relPath = Buffer.from(episodeId, 'hex').toString('utf-8');
    const safeVideoPath = getSafePath(settings.videoDir, relPath);

    if (!fs.existsSync(safeVideoPath)) {
      return res.status(404).send('Video not found');
    }

    // Parse bytes range
    let start = 0;
    let end = null;
    const fakeTotalSize = 1000000000; // 1GB fake size

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      start = parseInt(parts[0], 10) || 0;
      end = parts[1] ? parseInt(parts[1], 10) : null;
    }

    // iOS Safari range probing check (usually Range: bytes=0-1)
    if (range && end !== null && (end - start) === 1) {
      // Respond with a dummy fragmented MP4 ftyp header segment to satisfy WebKit probe
      const dummyHeader = Buffer.from([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70]);
      const chunk = dummyHeader.slice(start, end + 1);
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${fakeTotalSize}`,
        'Content-Length': chunk.length,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(chunk);
      return;
    }

    // Kill any active transcoders to free CPU resources (single concurrent stream model)
    for (const [id, proc] of activeTranscodeProcesses.entries()) {
      try {
        console.log(`[Transcoder]: Terminating orphaned transcoder process for episode: ${id}`);
        proc.kill('SIGKILL');
      } catch (e) {}
    }
    activeTranscodeProcesses.clear();

    const responseStatus = range ? 206 : 200;
    const responseHeaders = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*'
    };

    if (range) {
      const resEnd = end || (fakeTotalSize - 1);
      responseHeaders['Content-Range'] = `bytes ${start}-${resEnd}/${fakeTotalSize}`;
    }

    res.writeHead(responseStatus, responseHeaders);

    const ffmpegArgs = [];
    
    // Fast time-based seeking on input side (performs keyframe seek before input file reads)
    if (startTime > 0) {
      ffmpegArgs.push('-ss', startTime.toString());
    }

    ffmpegArgs.push(
      '-i', safeVideoPath,
      '-vf', "scale='min(1920,iw)':-2,format=yuv420p", // Scales 4K down to 1080p for performance & resolves H.264 profile resolution limits
      '-c:v', 'libx264',
      '-preset', 'ultrafast',   // Crucial for real-time streaming to avoid CPU lag
      '-tune', 'zerolatency',
      '-c:a', 'aac',
      '-ac', '2',               // Downmix to stereo
      '-b:a', '128k',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
      'pipe:1'
    );

    // Spawn FFmpeg to transcode stream starting from requested time offset
    const ffmpegProcess = spawn(ffmpegCmd, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    activeTranscodeProcesses.set(episodeId, ffmpegProcess);

    // Pipe stdout, discarding the first 'start' bytes if requested (handles partial range seek offsets from Safari)
    let bytesDiscarded = 0;
    ffmpegProcess.stdout.on('data', (chunk) => {
      if (bytesDiscarded < start) {
        const needed = start - bytesDiscarded;
        if (chunk.length <= needed) {
          bytesDiscarded += chunk.length;
        } else {
          const sliced = chunk.slice(needed);
          bytesDiscarded = start;
          res.write(sliced);
        }
      } else {
        res.write(chunk);
      }
    });

    ffmpegProcess.stdout.on('end', () => {
      res.end();
    });

    // Log FFmpeg stderr for diagnostic purposes
    ffmpegProcess.stderr.on('data', (data) => {
      console.log(`[FFmpeg Transcoder]: ${data.toString().trim()}`);
    });

    req.on('close', () => {
      ffmpegProcess.kill('SIGKILL');
      activeTranscodeProcesses.delete(episodeId);
    });

    ffmpegProcess.on('error', (err) => {
      console.error('FFmpeg process error:', err);
    });

  } catch (err) {
    console.error('Error transcoding video:', err);
    res.status(500).send('Internal server error');
  }
});

// Serve subtitles, converting SRT to VTT on the fly if needed
app.get('/api/subtitles/:episodeId', (req, res) => {
  const settings = getSettings();
  const { episodeId } = req.params;

  try {
    const relPath = Buffer.from(episodeId, 'hex').toString('utf-8');
    const ext = path.extname(relPath);
    const relPathNoExt = relPath.slice(0, -ext.length);
    const parentDir = path.dirname(relPath);
    const showPath = getSafePath(settings.videoDir, parentDir);

    if (!fs.existsSync(showPath)) {
      return res.status(404).send('Subtitle folder not found');
    }

    const files = fs.readdirSync(showPath);
    const baseNameNoExt = path.basename(relPathNoExt).toLowerCase();
    
    // Find matching subtitle file regardless of casing
    const subtitleFile = files.find(file => {
      const fileExt = path.extname(file).toLowerCase();
      const fileNameNoExt = path.basename(file, fileExt).toLowerCase();
      return fileNameNoExt === baseNameNoExt && ['.srt', '.vtt'].includes(fileExt);
    });

    if (!subtitleFile) {
      return res.status(404).send('Subtitle file not found');
    }

    const subtitlePath = path.join(showPath, subtitleFile);
    const subExt = path.extname(subtitleFile).toLowerCase();

    if (subExt === '.vtt') {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return fs.createReadStream(subtitlePath).pipe(res);
    } else if (subExt === '.srt') {
      // Convert SRT to WebVTT on the fly
      let srtContent = fs.readFileSync(subtitlePath, 'utf-8');
      
      // Convert commas to dots in time formats: "00:01:20,000" -> "00:01:20.000"
      const vttContent = 'WEBVTT\n\n' + srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return res.send(vttContent);
    }
  } catch (err) {
    console.error('Error serving subtitles:', err);
    res.status(500).send('Internal server error');
  }
});

// Pause optimization process
app.post('/api/library/optimize/pause', (req, res) => {
  const statusFile = path.join(__dirname, 'preprocess_status.json');
  try {
    let status = {};
    if (fs.existsSync(statusFile)) {
      try {
        status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      } catch (e) {}
    }
    status.isPaused = true;
    status.isRunning = false;
    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2), 'utf8');

    if (activePreprocessProcess) {
      try {
        activePreprocessProcess.kill('SIGTERM');
      } catch (e) {}
      activePreprocessProcess = null;
    }
    isPreprocessing = false;

    console.log('[Optimization]: Paused by user request.');
    return res.json({ success: true, message: 'Optimization paused', status });
  } catch (e) {
    console.error('Error pausing optimization:', e);
    return res.status(500).json({ error: 'Failed to pause optimization' });
  }
});

// Resume optimization process
app.post('/api/library/optimize/resume', (req, res) => {
  const statusFile = path.join(__dirname, 'preprocess_status.json');
  try {
    let status = {};
    if (fs.existsSync(statusFile)) {
      try {
        status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      } catch (e) {}
    }
    status.isPaused = false;
    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2), 'utf8');

    console.log('[Optimization]: Resumed by user request.');
    spawnPreprocessJob();

    return res.json({ success: true, message: 'Optimization resumed', status });
  } catch (e) {
    console.error('Error resuming optimization:', e);
    return res.status(500).json({ error: 'Failed to resume optimization' });
  }
});

// Fetch official anime cover/poster thumbnail from Mikan Project
async function fetchMikanCoverImage(rssUrl, targetShowDir) {
  try {
    const bangumiMatch = rssUrl.match(/bangumiId=(\d+)/i);
    if (!bangumiMatch) return false;

    const bangumiId = bangumiMatch[1];
    const pageUrl = `https://mikanani.me/Home/Bangumi/${bangumiId}`;

    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!res.ok) return false;
    const html = await res.text();

    const posterMatch = html.match(/\/images\/Bangumi\/[^\s'"]+\.(?:jpg|jpeg|png|webp)/i);
    if (!posterMatch) return false;

    let imageUrl = posterMatch[0];
    if (imageUrl.startsWith('/')) {
      imageUrl = `https://mikanani.me${imageUrl}`;
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return false;

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const extMatch = imageUrl.match(/\.(jpg|jpeg|png|webp)/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const coverPath = path.join(targetShowDir, `cover.${ext}`);

    fs.writeFileSync(coverPath, buffer);
    console.log(`[Mikan-Cover]: Downloaded cover image to ${coverPath}`);
    return true;
  } catch (err) {
    console.error('[Mikan-Cover]: Failed to fetch cover image:', err.message);
    return false;
  }
}

// Helper to parse XML RSS Feed text
function parseXmlRssItems(xmlText) {
  const channelTitleMatch = xmlText.match(/<channel>[\s\S]*?<title>(.*?)<\/title>/i);
  const rawChannelTitle = channelTitleMatch ? channelTitleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';

  const items = [];
  const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleM = itemXml.match(/<title>(.*?)<\/title>/i);
    const linkM = itemXml.match(/<link>(.*?)<\/link>/i);
    const encM = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    const pubM = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i);

    const title = titleM ? titleM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
    const link = linkM ? linkM[1].trim() : '';
    const enclosureUrl = encM ? encM[1].trim() : '';
    const pubDate = pubM ? pubM[1].trim() : '';

    items.push({
      title,
      link,
      enclosure: enclosureUrl ? { url: enclosureUrl } : null,
      pubDate
    });
  }

  return { rawChannelTitle, items };
}

// Universal Media Search (TMDB + Mikan)
app.get('/api/media/search', async (req, res) => {
  const query = req.query.q || '';
  const type = req.query.type || 'all'; // 'all' | 'anime' | 'tv'
  if (!query.trim()) {
    return res.json({ success: true, count: 0, results: [] });
  }

  const settings = getSettings();

  try {
    const results = [];

    // 1. Search Anime via Mikan if type is 'all' or 'anime'
    if (type === 'all' || type === 'anime') {
      const animeResults = await searchMikanAnime(query.trim());
      animeResults.forEach(a => {
        results.push({
          id: `mikan_${a.bangumiId}`,
          source: 'mikan',
          mediaType: 'anime',
          showType: 'Anime',
          name: a.title,
          originalName: a.title,
          bangumiId: a.bangumiId,
          posterUrl: a.poster,
          year: ''
        });
      });
    }

    // 2. Search TMDB if type is 'all' or 'tv'
    if (type === 'all' || type === 'tv') {
      const tmdbResults = await searchTmdb(query.trim(), settings.tmdbApiKey);
      tmdbResults.forEach(t => {
        results.push({
          id: `tmdb_${t.id}`,
          source: 'tmdb',
          mediaType: t.mediaType,
          showType: t.showType,
          name: t.name,
          originalName: t.originalName,
          tmdbId: t.id,
          posterUrl: t.posterUrl,
          backdropUrl: t.backdropUrl,
          year: t.year,
          country: t.country,
          overview: t.overview
        });
      });
    }

    return res.json({ success: true, count: results.length, results });
  } catch (err) {
    console.error('Error in /api/media/search:', err);
    return res.status(500).json({ error: 'Search failed: ' + err.message });
  }
});

// Fetch detailed seasons & info for a TMDB show
app.get('/api/media/details/:tmdbId', async (req, res) => {
  const { tmdbId } = req.params;
  if (!tmdbId) {
    return res.status(400).json({ error: 'tmdbId is required' });
  }

  const settings = getSettings();
  try {
    const details = await getTmdbShowDetails(tmdbId, settings.tmdbApiKey);
    if (!details) {
      return res.status(404).json({ error: 'Show details not found' });
    }
    return res.json({ success: true, details });
  } catch (err) {
    console.error('Error in /api/media/details:', err);
    return res.status(500).json({ error: 'Failed to fetch details: ' + err.message });
  }
});

// Fetch torrent episodes for a specific TMDB show season
app.get('/api/media/episodes', async (req, res) => {
  const { imdbId, showName, originalName, seasonNumber, showType, country } = req.query;

  try {
    const parsedSeason = parseInt(seasonNumber, 10) || 1;
    const countryArr = country ? String(country).split(',') : [];

    const result = await searchUniversalMediaTorrents({
      imdbId,
      showName,
      originalName,
      seasonNumber: parsedSeason,
      showType,
      country: countryArr
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in /api/media/episodes:', err);
    return res.status(500).json({ error: 'Failed to fetch episodes: ' + err.message });
  }
});

// Universal Media Tracker Subscription endpoint (TMDB TV shows & Anime)
app.post('/api/media/subscribe', async (req, res) => {
  const {
    showName,
    showType = 'TV',
    seasonNumber = 1,
    posterUrl,
    selectedEpisodes = []
  } = req.body;

  if (!showName || selectedEpisodes.length === 0) {
    return res.status(400).json({ error: 'Show name and episodes are required' });
  }

  const settings = getSettings();
  const cleanTitle = cleanShowName(showName);
  const seasonSuffix = seasonNumber > 1 ? ` S0${seasonNumber}` : '';
  const finalFolder = `${cleanTitle}${seasonSuffix}`;

  // 1. Structure hierarchical category: TV/Chinese/<Show>, TV/Western/<Show>, etc.
  let category = 'TV';
  if (showType === 'Chinese') category = `TV/Chinese/${cleanTitle}`;
  else if (showType === 'Western') category = `TV/Western/${cleanTitle}`;
  else if (showType === 'Korean') category = `TV/Korean/${cleanTitle}`;
  else if (showType === 'Japanese') category = `TV/Japanese/${cleanTitle}`;
  else if (showType === 'Anime') category = `Anime/${cleanTitle}`;
  else category = `TV/${cleanTitle}`;

  // 2. Resolve save path
  const hostSavePath = path.join(settings.videoDir, finalFolder);
  if (!fs.existsSync(hostSavePath)) {
    try {
      fs.mkdirSync(hostSavePath, { recursive: true });
    } catch (e) {}
  }

  // 3. Save poster image to directory if provided
  if (posterUrl) {
    try {
      const posterPath = path.join(hostSavePath, 'poster.jpg');
      if (!fs.existsSync(posterPath)) {
        const imgRes = await fetch(posterUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          fs.writeFileSync(posterPath, Buffer.from(buffer));
          console.log(`[Media Subscribe]: Saved official poster to ${posterPath}`);
        }
      }
    } catch (err) {
      console.warn('[Media Subscribe]: Could not download poster:', err.message);
    }
  }

  // 4. Create category & add torrents in qBittorrent
  const isQbConfigured = Boolean(settings.qbHost && settings.qbPort);
  if (isQbConfigured) {
    try {
      const qb = new QBittorrentClient(settings);
      const qbSavePath = getQbSavePath(hostSavePath, settings);
      await qb.createCategory({ category, savePath: qbSavePath });

      // Add tags: rss-auto, media:tv, status:airing, season:2026-Qx
      const currentYear = new Date().getFullYear();
      const currentQuarter = Math.floor((new Date().getMonth() + 3) / 3);
      const tags = ['rss-auto', 'media:tv', 'status:airing', `season:${currentYear}-Q${currentQuarter}`];

      const torrentUrls = selectedEpisodes.map(ep => ep.downloadUrl).filter(Boolean);
      if (torrentUrls.length > 0) {
        console.log(`[Media Subscribe]: Pushing ${torrentUrls.length} torrents to qBittorrent under category "${category}"`);
        await qb.addTorrents({
          urls: torrentUrls,
          savePath: qbSavePath,
          category,
          tags
        });
      }
    } catch (err) {
      console.error('[Media Subscribe]: Error pushing to qBittorrent:', err);
    }
  }

  return res.json({
    success: true,
    showName: cleanTitle,
    category,
    episodesQueued: selectedEpisodes.length
  });
});

// Search anime on Mikan Project
app.get('/api/anime/search', async (req, res) => {
  const query = req.query.q || '';
  if (!query.trim()) {
    return res.json({ success: true, count: 0, results: [] });
  }

  try {
    const results = await searchMikanAnime(query.trim());
    return res.json({ success: true, count: results.length, results });
  } catch (err) {
    console.error('Error in /api/anime/search:', err);
    return res.status(500).json({ error: 'Search failed: ' + err.message });
  }
});

// Fetch detailed fansub subgroups for a specific bangumi ID
app.get('/api/anime/details/:bangumiId', async (req, res) => {
  const { bangumiId } = req.params;
  if (!bangumiId) {
    return res.status(400).json({ error: 'bangumiId is required' });
  }

  try {
    const details = await getMikanBangumiDetails(bangumiId);
    if (!details) {
      return res.status(404).json({ error: 'Bangumi details not found' });
    }
    return res.json({ success: true, details });
  } catch (err) {
    console.error('Error in /api/anime/details:', err);
    return res.status(500).json({ error: 'Failed to fetch details: ' + err.message });
  }
});

// Preview RSS Feed items and proposed clean folder/filenames
app.post('/api/rss/preview', async (req, res) => {
  const { rssUrl } = req.body;
  if (!rssUrl) {
    return res.status(400).json({ error: 'RSS URL is required' });
  }

  try {
    const fetchRes = await fetch(rssUrl);
    if (!fetchRes.ok) {
      return res.status(400).json({ error: `Failed to fetch RSS feed (HTTP ${fetchRes.status})` });
    }
    const xmlText = await fetchRes.text();
    const { rawChannelTitle, items } = parseXmlRssItems(xmlText);

    if (items.length === 0) {
      return res.status(400).json({ error: 'No items found in the RSS feed' });
    }

    const proposedShowName = cleanShowName(rawChannelTitle || items[0].title);
    const deduplicatedEpisodes = deduplicateAndFilterRssItems(items);

    return res.json({
      success: true,
      rawChannelTitle,
      proposedShowName,
      totalRawItems: items.length,
      episodesCount: deduplicatedEpisodes.length,
      episodes: deduplicatedEpisodes,
      rawItems: items
    });
  } catch (err) {
    console.error('Error previewing RSS feed:', err);
    return res.status(500).json({ error: 'Error parsing RSS feed: ' + err.message });
  }
});

// Auto-subscribe anime RSS and batch download past episodes via qBittorrent
app.post('/api/rss/subscribe', async (req, res) => {
  const { rssUrl, showName, selectedEpisodes, rawItems = [], filterKeyword = "" } = req.body;
  if (!rssUrl || !showName || !selectedEpisodes || !Array.isArray(selectedEpisodes)) {
    return res.status(400).json({ error: 'Invalid subscription request payload' });
  }

  try {
    const settings = getSettings();
    if (!settings.videoDir) {
      return res.status(400).json({ error: 'Library directory is not configured in settings.' });
    }

    // 1. Create clean target show directory inside videoDir with full permissions for Docker/qBittorrent
    const targetShowDir = path.join(settings.videoDir, showName);
    if (!fs.existsSync(targetShowDir)) {
      fs.mkdirSync(targetShowDir, { recursive: true, mode: 0o777 });
    }
    try {
      fs.chmodSync(targetShowDir, 0o777);
    } catch (e) {}

    // Automatically fetch official Mikan cover art thumbnail to target directory
    fetchMikanCoverImage(rssUrl, targetShowDir).catch(err => {
      console.error('Non-blocking Mikan cover download failed:', err.message);
    });

    const qbSavePath = getQbSavePath(targetShowDir, settings);
    // Compute structured Category & Season Tags
    const categoryName = `Anime/${showName}`;
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const seasonTag = `season:${now.getFullYear()}-Q${quarter}`;
    const trackingTags = ['rss-auto', 'status:airing', seasonTag];

    // 2. Initialize qBittorrent Client and ensure category exists with mapped savePath
    const qb = new QBittorrentClient(settings);
    await qb.createCategory({ category: categoryName, savePath: qbSavePath });

    // Filter rawItems FIRST by filterKeyword, then deduplicate per episode
    let episodesToDownload = selectedEpisodes;
    if (rawItems && Array.isArray(rawItems) && rawItems.length > 0) {
      episodesToDownload = deduplicateAndFilterRssItems(rawItems, filterKeyword);
    } else if (filterKeyword && filterKeyword.trim()) {
      const kw = filterKeyword.trim();
      const isRegex = /[|*?()+\[\]\\]/.test(kw);
      episodesToDownload = selectedEpisodes.filter(ep => {
        const title = ep.rawTitle || ep.cleanEpisodeName || "";
        if (isRegex) {
          try {
            const regex = new RegExp(kw, 'i');
            return regex.test(title);
          } catch (e) {}
        }
        const keywords = kw.split(/\s+/).filter(Boolean);
        return keywords.every(k => title.toLowerCase().includes(k.toLowerCase()));
      });
    }

    const downloadUrls = episodesToDownload.map(ep => ep.downloadUrl).filter(Boolean);

    let torrentsAdded = false;
    let rssFeedAdded = false;
    let rssRuleAdded = false;

    if (downloadUrls.length > 0) {
      torrentsAdded = await qb.addTorrents({
        urls: downloadUrls,
        savePath: qbSavePath,
        category: categoryName,
        tags: trackingTags
      });
    }

    // 3. Register RSS Feed and Rule in qBittorrent for future episodes
    const cleanFeedPath = showName.replace(/[^a-zA-Z0-9_-]/g, '_');
    rssFeedAdded = await qb.addRssFeed({
      url: rssUrl,
      feedPath: cleanFeedPath
    });

    rssRuleAdded = await qb.setRssRule({
      ruleName: `${showName} Auto-Download`,
      savePath: qbSavePath,
      feedPath: cleanFeedPath,
      feedUrl: rssUrl,
      mustContain: filterKeyword || "",
      category: categoryName,
      ratioLimit: settings.ratioLimit ?? 1.5,
      seedingTimeLimit: (settings.retentionHours ?? 72) * 60
    });

    return res.json({
      success: true,
      message: `Successfully subscribed to ${showName}!`,
      targetShowDir,
      category: categoryName,
      episodesQueued: downloadUrls.length,
      torrentsAdded,
      rssFeedAdded,
      rssRuleAdded
    });
  } catch (err) {
    console.error('Error subscribing RSS feed:', err);
    return res.status(500).json({ error: 'Error subscribing RSS feed: ' + err.message });
  }
});

// --- Background Torrent Lifecycle & Retention Worker ---
async function runTorrentLifecycleWorker() {
  try {
    const settings = getSettings();
    if (!settings.autoRemoveTorrents) {
      return;
    }

    console.log('[Lifecycle Worker]: Running periodic qBittorrent seeding & retention check...');
    const qb = new QBittorrentClient(settings);
    
    // Query completed torrents tagged with rss-auto
    const completedTorrents = await qb.getTorrentsInfo({ filter: 'completed', tag: 'rss-auto' });
    if (!completedTorrents || !Array.isArray(completedTorrents) || completedTorrents.length === 0) {
      return;
    }

    const maxRatio = settings.ratioLimit ?? 1.5;
    const maxSeedingSeconds = (settings.retentionHours ?? 72) * 3600;
    const isDeleteOnIngest = settings.deleteOnIngest === true;
    const hashesToDelete = [];

    for (const torrent of completedTorrents) {
      const seedingSeconds = torrent.seeding_time || torrent.time_conv || 0;
      const ratio = torrent.ratio || 0;

      const isRatioReached = ratio >= maxRatio;
      const isTimeReached = seedingSeconds >= maxSeedingSeconds;

      if (isDeleteOnIngest || isRatioReached || isTimeReached) {
        console.log(`[Lifecycle Worker]: Pruning completed torrent '${torrent.name}' (ratio=${ratio.toFixed(2)}/${maxRatio}, seedTime=${Math.round(seedingSeconds/3600)}h/${Math.round(maxSeedingSeconds/3600)}h). Preserving disk media files.`);
        hashesToDelete.push(torrent.hash);
      }
    }

    if (hashesToDelete.length > 0) {
      // deleteFiles = false GUARANTEES media files on disk are NEVER touched!
      await qb.deleteTorrents({ hashes: hashesToDelete, deleteFiles: false });
      console.log(`[Lifecycle Worker]: Successfully pruned ${hashesToDelete.length} seeded torrent task(s) from qBittorrent.`);
    }
  } catch (err) {
    console.error('[Lifecycle Worker]: Error in lifecycle worker:', err.message);
  }
}

// Run lifecycle worker every 30 minutes
setInterval(runTorrentLifecycleWorker, 30 * 60 * 1000);
setTimeout(runTorrentLifecycleWorker, 10 * 1000);

// Explicit GET handlers to provide clear JSON feedback instead of default Express 404
app.get('/api/rss/subscribe', (req, res) => {
  return res.status(405).json({ error: 'Method Not Allowed. Please send a POST request with rssUrl, showName, and selectedEpisodes parameters.' });
});

app.get('/api/rss/preview', (req, res) => {
  return res.status(405).json({ error: 'Method Not Allowed. Please send a POST request with rssUrl parameter.' });
});

// Serve built static frontend bundle in production mode if client/dist exists
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

let isPreprocessing = false;
let activePreprocessProcess = null;

function spawnPreprocessJob() {
  if (isPreprocessing) {
    console.log('[Auto-Preprocess]: Preprocess job already running. Skipping.');
    return;
  }

  const statusFile = path.join(__dirname, 'preprocess_status.json');
  if (fs.existsSync(statusFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      if (data.isPaused) {
        console.log('[Auto-Preprocess]: Preprocess job is paused. Skipping spawn.');
        return;
      }
    } catch (e) {}
  }

  isPreprocessing = true;
  console.log('[Auto-Preprocess]: Starting library optimization scan...');

  // Spawn preprocess.js in the parent directory
  activePreprocessProcess = spawn('node', [path.join(__dirname, '..', 'preprocess.js')], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore'
  });

  activePreprocessProcess.on('close', (code) => {
    isPreprocessing = false;
    activePreprocessProcess = null;
    console.log(`[Auto-Preprocess]: Library scan finished (exit code ${code}).`);
  });

  activePreprocessProcess.on('error', (err) => {
    isPreprocessing = false;
    activePreprocessProcess = null;
    console.error('[Auto-Preprocess]: Failed to spawn preprocess script:', err);
  });
}

// Run server
const settings = getSettings();
app.listen(settings.port, '0.0.0.0', () => {
  console.log(`yystreaming backend running on port ${settings.port}`);
  console.log('Available on local network interfaces:');
  const ips = getLocalIps();
  ips.forEach(ip => {
    console.log(`  http://${ip}:${settings.port}`);
  });
  console.log(`  http://localhost:${settings.port}`);

  // Trigger initial library preprocessing scan on startup
  spawnPreprocessJob();

  // Run library optimizer periodically every 30 minutes
  setInterval(spawnPreprocessJob, 30 * 60 * 1000);
});
