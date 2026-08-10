import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths configuration
const SETTINGS_FILE = path.join(__dirname, 'server', 'settings.json');

// Resolve dynamic paths for FFmpeg & FFprobe
let ffmpegCmd = 'ffmpeg';
let ffprobeCmd = 'ffprobe';

function resolveTools() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch (e) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const wingetFfmpeg = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe');
    if (fs.existsSync(wingetFfmpeg)) {
      ffmpegCmd = wingetFfmpeg;
    }
  }

  try {
    execSync('ffprobe -version', { stdio: 'ignore' });
  } catch (e) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const wingetFfprobe = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffprobe.exe');
    if (fs.existsSync(wingetFfprobe)) {
      ffprobeCmd = wingetFfprobe;
    }
  }
}

// Load settings to find videoDir
function getVideoDirectory() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (settings.videoDir && fs.existsSync(settings.videoDir)) {
        return settings.videoDir;
      }
    } catch (e) {
      console.error('Error reading settings file:', e);
    }
  }
  return null;
}

function hasBurnedSubtitles(filePath) {
  try {
    const stdout = execSync(`"${ffprobeCmd}" -v error -show_entries format_tags=comment -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    return stdout.toString().trim() === 'subtitles_burned_v4';
  } catch (e) {
    return false;
  }
}

function findBestExternalSubtitle(directory, baseName) {
  if (!fs.existsSync(directory)) return null;
  try {
    const files = fs.readdirSync(directory);
    const lowerBase = baseName.toLowerCase();
    
    const candidates = files.filter(f => {
      const lowerF = f.toLowerCase();
      if (!lowerF.startsWith(lowerBase)) return false;
      const remainder = lowerF.slice(lowerBase.length);
      return remainder.startsWith('.') && 
             (lowerF.endsWith('.ass') || lowerF.endsWith('.srt') || lowerF.endsWith('.vtt') || lowerF.endsWith('.ssa'));
    });

    if (candidates.length === 0) return null;

    // Prioritize CHS/Simplified Chinese
    const chsKeywords = ['.chs.', '.zh-hans.', '.zh-cn.', '.简体.', '.简.'];
    for (const kw of chsKeywords) {
      const found = candidates.find(f => f.toLowerCase().includes(kw));
      if (found) return found;
    }

    // Prioritize CHT/Traditional Chinese
    const chtKeywords = ['.cht.', '.zh-hant.', '.zh-tw.', '.zh-hk.', '.繁体.', '.繁.'];
    for (const kw of chtKeywords) {
      const found = candidates.find(f => f.toLowerCase().includes(kw));
      if (found) return found;
    }

    // Prioritize generic Chinese
    const zhKeywords = ['.zh.', '.chi.', '.zho.'];
    for (const kw of zhKeywords) {
      const found = candidates.find(f => f.toLowerCase().includes(kw));
      if (found) return found;
    }

    // Fallback to the first matching subtitle file (e.g. ASS first, then SRT, then VTT)
    candidates.sort((a, b) => {
      const extA = path.extname(a).toLowerCase();
      const extB = path.extname(b).toLowerCase();
      if (extA === '.ass' && extB !== '.ass') return -1;
      if (extB === '.ass' && extA !== '.ass') return 1;
      return a.localeCompare(b);
    });

    return candidates[0];
  } catch (e) {
    console.error('Error finding external subtitle:', e.message);
    return null;
  }
}

// Scan directories recursively for videos to optimize
function scanDirectory(dir, videoFiles = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (!fs.existsSync(fullPath)) continue;
    
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      continue;
    }

    if (stat.isDirectory()) {
      scanDirectory(fullPath, videoFiles);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.mkv', '.avi', '.mov'].includes(ext)) {
        // Skip files that were modified within the last 2 minutes (likely downloading or copying)
        const lastModifiedAge = (Date.now() - stat.mtimeMs) / 1000;
        if (lastModifiedAge < 120) {
          console.log(`[Preprocessor]: Skipping ${file} - recently modified (likely downloading or copying).`);
          continue;
        }

        // Check if optimized mp4 sibling exists and verify integrity
        const baseName = file.slice(0, -ext.length);
        const mp4Path = path.join(dir, baseName + '.mp4');
        
        let needTranscode = false;
        if (!fs.existsSync(mp4Path)) {
          needTranscode = true;
        } else {
          // If mp4 exists, check if it is valid and playable
          try {
            execSync(`"${ffprobeCmd}" -v error -show_format "${mp4Path}"`, { stdio: 'ignore' });

            const originalProbe = probeStreams(fullPath);
            const hasEmbeddedSub = hasTextSubtitle(originalProbe);
            const hasExternalSub = !!findBestExternalSubtitle(dir, baseName);
            if (hasEmbeddedSub || hasExternalSub) {
              if (!hasBurnedSubtitles(mp4Path)) {
                console.log(`[Preprocessor]: Optimized file ${baseName}.mp4 lacks burned-in subtitles. Queueing for non-disruptive rebuild.`);
                needTranscode = true;
              }
            }
          } catch (e) {
            console.log(`[Preprocessor]: Detected corrupted optimized file: ${baseName}.mp4. Deleting and re-queueing for transcoding.`);
            try {
              fs.unlinkSync(mp4Path);
            } catch (unlinkErr) {}
            needTranscode = true;
          }
        }

        if (needTranscode) {
          videoFiles.push({
            absolutePath: fullPath,
            directory: dir,
            fileName: file,
            baseName: baseName,
            ext: ext
          });
        }
      }
    }
  }
  return videoFiles;
}

// Check stream types inside file
function probeStreams(filePath) {
  try {
    const stdout = execSync(`"${ffprobeCmd}" -v error -show_entries stream=index,codec_type,codec_name -of json "${filePath}"`);
    return JSON.parse(stdout.toString());
  } catch (e) {
    console.error('Error probing streams:', e.message);
    return { streams: [] };
  }
}

// Supported text-based subtitle formats for MP4 native embedding
const textSubtitleCodecs = ['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'srt'];

function hasTextSubtitle(probeData) {
  return probeData.streams.some(s => 
    s.codec_type === 'subtitle' && 
    textSubtitleCodecs.includes(s.codec_name)
  );
}

function getTextSubtitleStream(probeData) {
  return probeData.streams.find(s => 
    s.codec_type === 'subtitle' && 
    textSubtitleCodecs.includes(s.codec_name)
  );
}

const STATUS_FILE = path.join(__dirname, 'server', 'preprocess_status.json');
const QUEUE_FILE = path.join(__dirname, 'server', 'preprocess_queue.json');

function writeStatus(data) {
  try {
    let existing = {};
    if (fs.existsSync(STATUS_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      } catch (e) {}
    }
    const updated = { ...existing, ...data };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(updated, null, 2));
  } catch (e) {
    console.error('Error writing status file:', e);
  }
}

function isPausedState() {
  if (fs.existsSync(STATUS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      return !!data.isPaused;
    } catch (e) {}
  }
  return false;
}

// Main logic
async function main() {
  resolveTools();
  console.log('=== yyStreaming Library Pre-Processor ===');
  console.log('FFmpeg Path:', ffmpegCmd);
  console.log('FFprobe Path:', ffprobeCmd);

  if (isPausedState()) {
    console.log('[Preprocessor]: Optimization is currently paused. Exiting script.');
    writeStatus({ isRunning: false, isPaused: true });
    process.exit(0);
  }

  writeStatus({
    isRunning: true,
    currentFile: 'Scanning library...',
    currentIndex: 0,
    totalFiles: 0,
    currentTime: 0,
    totalDuration: 0,
    percentage: 0,
    speed: '0x',
    eta: 0
  });

  const videoDir = getVideoDirectory();
  if (!videoDir) {
    console.error('\nError: Video directory is not configured or settings.json does not exist.');
    console.error('Please configure your library path in the settings page of the web app first.');
    writeStatus({ isRunning: false, error: 'Library path not configured' });
    process.exit(1);
  }

  console.log('Scanning library:', videoDir);
  const scannedQueue = scanDirectory(videoDir);

  // Merge scanned queue with existing queue
  let persistedQueue = [];
  if (fs.existsSync(QUEUE_FILE)) {
    try {
      persistedQueue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    } catch (e) {
      persistedQueue = [];
    }
  }

  // Keep only items that still need transcoding
  const scannedPaths = new Set(scannedQueue.map(item => item.absolutePath));
  persistedQueue = persistedQueue.filter(item => scannedPaths.has(item.absolutePath));

  // Find new items not yet in the queue
  const existingPaths = new Set(persistedQueue.map(item => item.absolutePath));
  const newItems = scannedQueue.filter(item => !existingPaths.has(item.absolutePath));

  // Append new items
  persistedQueue = [...persistedQueue, ...newItems];
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(persistedQueue, null, 2), 'utf8');

  if (persistedQueue.length === 0) {
    console.log('\nAll videos are already optimized! No tasks in queue.');
    writeStatus({
      isRunning: false,
      lastCompleted: new Date().toISOString(),
      queueLength: 0
    });
    process.exit(0);
  }

  console.log(`\nFound ${persistedQueue.length} files in queue needing optimization.\n`);

  let totalFiles = persistedQueue.length;
  let currentIndex = 0;
  while (true) {
    if (isPausedState()) {
      console.log('[Preprocessor]: Optimization is paused. Exiting loop.');
      writeStatus({ isRunning: false, isPaused: true });
      process.exit(0);
    }

    // Load queue dynamically to support user prioritization
    let currentQueue = [];
    if (fs.existsSync(QUEUE_FILE)) {
      try {
        currentQueue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
      } catch (e) {
        currentQueue = [];
      }
    }

    if (currentQueue.length === 0) {
      break;
    }

    // Shift the first item off the queue
    const item = currentQueue[0];
    currentIndex++;

    // Adjust total files dynamically if queue was expanded
    if (currentQueue.length > totalFiles) {
      totalFiles = currentQueue.length;
    }

    const remainingQueue = currentQueue.slice(1);
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(remainingQueue, null, 2), 'utf8');

    const outputPath = path.join(item.directory, item.baseName + '.mp4');
    const srtPath = path.join(item.directory, item.baseName + '.srt');

    console.log(`[${currentIndex}/${totalFiles}] Optimizing: ${item.fileName}`);

    // Probe duration using ffprobe for progress calculation
    let duration = 0;
    try {
      const probeOut = execSync(`"${ffprobeCmd}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${item.absolutePath}"`);
      duration = parseFloat(probeOut.toString().trim()) || 0;
    } catch (e) {
      console.error('  -> Warning: Failed to probe duration for progress tracking:', e.message);
    }

    // 1. Resolve subtitle file (prioritize external subtitles, fallback to embedded extraction)
    const probeData = probeStreams(item.absolutePath);
    const subtitleStream = getTextSubtitleStream(probeData);
    
    let srtFileName = '';
    let hasSrt = false;

    const bestExtSub = findBestExternalSubtitle(item.directory, item.baseName);
    if (bestExtSub) {
      srtFileName = bestExtSub;
      hasSrt = true;
      console.log(`  -> Found external subtitle: ${srtFileName}`);
    } else if (subtitleStream) {
      srtFileName = item.baseName + '.srt';
      console.log(`  -> Found subtitle stream (index ${subtitleStream.index}). Extracting...`);
      try {
        // Extract the subtitle stream to .srt using relative paths
        execSync(`"${ffmpegCmd}" -y -i "${item.fileName}" -map 0:${subtitleStream.index} "${srtFileName}"`, { 
          cwd: item.directory,
          stdio: 'ignore' 
        });
        hasSrt = true;
        console.log(`  -> Extracted subtitle: ${srtFileName}`);
      } catch (subErr) {
        console.error(`  -> Warning: Subtitle extraction failed:`, subErr.message);
      }
    }

    // 2. Transcode to Web-Optimized MP4 (H.264 + AAC) with burned-in subtitles
    console.log(`  -> Transcoding to MP4...`);
    const transcodeStart = Date.now();

    const escapedSrtName = srtFileName.replace(/'/g, "\\'");
    const tempOutputFileName = item.baseName + '.mp4.tmp';
    const isAss = srtFileName.toLowerCase().endsWith('.ass') || srtFileName.toLowerCase().endsWith('.ssa');

    const ffmpegArgs = [
      '-y',
      '-i', item.fileName,
      '-vf', hasSrt 
        ? `scale='min(1920,iw)':-2,format=yuv420p,subtitles='${escapedSrtName}':force_style='PlayResY=1080,FontSize=28,MarginV=25'`
        : "scale='min(1920,iw)':-2,format=yuv420p",
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '21',
      '-c:a', 'aac',
      '-ac', '2',
      '-b:a', '192k'
    ];

    if (hasSrt) {
      ffmpegArgs.push('-metadata', 'comment=subtitles_burned_v4');
    } else {
      ffmpegArgs.push('-metadata', 'comment=no_subtitles');
    }

    ffmpegArgs.push('-f', 'mp4', tempOutputFileName);

    await new Promise((resolve) => {
      // Spawn capturing stderr for progress tracking inside the video directory CWD
      const proc = spawn(ffmpegCmd, ffmpegArgs, { 
        cwd: item.directory,
        stdio: ['ignore', 'ignore', 'pipe'] 
      });

      const checkPauseTimer = setInterval(() => {
        if (isPausedState()) {
          console.log('\n[Preprocessor]: Pause signal detected. Terminating FFmpeg process...');
          clearInterval(checkPauseTimer);
          try {
            proc.kill('SIGKILL');
          } catch (e) {}

          const tempFile = path.join(item.directory, tempOutputFileName);
          if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch (e) {}
          }

          try {
            let q = [];
            if (fs.existsSync(QUEUE_FILE)) {
              q = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
            }
            q.unshift(item);
            fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2), 'utf8');
          } catch (e) {}

          writeStatus({ isRunning: false, isPaused: true, currentFile: null });
          process.exit(0);
        }
      }, 1000);

      proc.stderr.on('data', (data) => {
        const line = data.toString();
        // Write to terminal so manual runs still see progress
        process.stderr.write(data);

        // Parse time and speed
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        const speedMatch = line.match(/speed=\s*([\d\.]+)x/);
        
        let currentTime = 0;
        let speed = '0x';
        let percentage = 0;
        let eta = 0;

        if (timeMatch) {
          const hrs = parseInt(timeMatch[1], 10);
          const mins = parseInt(timeMatch[2], 10);
          const secs = parseInt(timeMatch[3], 10);
          currentTime = hrs * 3600 + mins * 60 + secs;
          if (duration > 0) {
            percentage = (currentTime / duration) * 100;
          }
        }

        if (speedMatch) {
          speed = speedMatch[1] + 'x';
          const speedNum = parseFloat(speedMatch[1]);
          if (speedNum > 0 && duration > 0) {
            eta = Math.max(0, (duration - currentTime) / speedNum);
          }
        }

        if (timeMatch || speedMatch) {
          writeStatus({
            isRunning: true,
            currentFile: item.fileName,
            currentIndex: currentIndex,
            totalFiles: totalFiles,
            currentTime,
            totalDuration: duration,
            percentage: parseFloat(percentage.toFixed(1)),
            speed,
            eta: Math.round(eta)
          });
        }
      });

      proc.on('close', (code) => {
        clearInterval(checkPauseTimer);
        const elapsed = ((Date.now() - transcodeStart) / 1000).toFixed(1);
        if (code === 0) {
          console.log(`\n  -> Success! Transcoded in ${elapsed}s.`);
          try {
            const absoluteTempPath = path.join(item.directory, tempOutputFileName);
            // Atomically replace old file with newly transcoded temp file
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
            fs.renameSync(absoluteTempPath, outputPath);
            console.log(`  -> Optimized file: ${path.basename(outputPath)}\n`);
          } catch (renameErr) {
            console.error(`  -> Failed to replace output file with temporary file:`, renameErr.message);
            const absoluteTempPath = path.join(item.directory, tempOutputFileName);
            if (fs.existsSync(absoluteTempPath)) {
              fs.unlinkSync(absoluteTempPath);
            }
          }
        } else {
          console.error(`\n  -> Failed! FFmpeg exited with code ${code}.\n`);
          const absoluteTempPath = path.join(item.directory, tempOutputFileName);
          if (fs.existsSync(absoluteTempPath)) {
            fs.unlinkSync(absoluteTempPath); // Delete incomplete file
          }
        }
        resolve();
      });
    });
  }

  console.log('=== Pre-processing completed successfully! ===');
  writeStatus({
    isRunning: false,
    lastCompleted: new Date().toISOString()
  });
}

main().catch(err => {
  console.error('Fatal error in preprocessor:', err);
  writeStatus({ isRunning: false, error: err.message });
});
