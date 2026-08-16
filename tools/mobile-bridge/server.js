import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';
import qrcode from 'qrcode-terminal';

const PORT = 3000;
const CDP_PORT = 9000;
const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.resolve('./public')));

// Find local IPv4 address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Find latest active conversation directory
function getLatestConversationId() {
  if (!fs.existsSync(BRAIN_DIR)) return null;
  const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));
  
  if (entries.length === 0) return null;
  entries.sort((a, b) => {
    const statA = fs.statSync(path.join(BRAIN_DIR, a.name));
    const statB = fs.statSync(path.join(BRAIN_DIR, b.name));
    return statB.mtimeMs - statA.mtimeMs;
  });

  return entries[0].name;
}

// Parse transcript.jsonl into clean chat messages
function parseTranscript(conversationId) {
  if (!conversationId) return [];
  const logFile = path.join(BRAIN_DIR, conversationId, '.system_generated', 'logs', 'transcript.jsonl');
  if (!fs.existsSync(logFile)) return [];

  try {
    const raw = fs.readFileSync(logFile, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    const messages = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (item.type === 'USER_INPUT' && item.content) {
          // Filter out internal system checkpoint prompts
          if (item.content.includes('<CONTEXT_SUMMARY>') || item.content.includes('<SYSTEM_MESSAGE>')) {
            continue;
          }
          const cleanText = item.content.replace(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i, '$1').trim();
          messages.push({
            id: `user-${item.step_index}`,
            sender: 'user',
            text: cleanText,
            timestamp: item.timestamp || new Date().toISOString()
          });
        } else if (item.type === 'PLANNER_RESPONSE') {
          const text = item.content || '';
          const toolCalls = (item.tool_calls || []).map(tc => tc.toolSummary || tc.toolAction || 'Running tool').filter(Boolean);

          if (text || toolCalls.length > 0) {
            messages.push({
              id: `agent-${item.step_index}`,
              sender: 'agent',
              text: text,
              tools: toolCalls,
              timestamp: item.timestamp || new Date().toISOString()
            });
          }
        }
      } catch (e) {}
    }

    return messages;
  } catch (err) {
    console.error('Error parsing transcript:', err);
    return [];
  }
}

// Send input via Chrome DevTools Protocol to Antigravity window
async function sendPromptViaCdp(promptText) {
  try {
    const targetsRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
    if (!targetsRes.ok) throw new Error('CDP port not responsive');
    const targets = await targetsRes.json();
    
    // Find Antigravity Page target
    const pageTarget = targets.find(t => t.type === 'page' || t.title.includes('Antigravity') || t.title.includes('Workspace'));
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error('Could not find Antigravity page target in CDP');
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

      ws.on('open', () => {
        // Execute JS to type into textarea and press Enter
        const script = `
          (() => {
            const inputArea = document.querySelector('textarea, [contenteditable="true"], .monaco-editor textarea');
            if (inputArea) {
              inputArea.focus();
              if (inputArea.tagName.toLowerCase() === 'textarea') {
                inputArea.value = ${JSON.stringify(promptText)};
                inputArea.dispatchEvent(new Event('input', { bubbles: true }));
                inputArea.dispatchEvent(new Event('change', { bubbles: true }));
              }
              // Find and click send button or simulate Enter
              const sendBtn = document.querySelector('button[aria-label*="Send"], button[title*="Send"], .send-button');
              if (sendBtn) {
                sendBtn.click();
              } else {
                inputArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              }
              return { success: true };
            }
            return { error: 'Input element not found' };
          })()
        `;

        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression: script, returnByValue: true }
        }));
      });

      ws.on('message', (data) => {
        const res = JSON.parse(data.toString());
        ws.close();
        resolve(res.result?.value || { success: true });
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  } catch (err) {
    console.warn('[CDP Warning]: Could not send via CDP (make sure Antigravity is launched with --remote-debugging-port=9000):', err.message);
    return { success: false, error: err.message };
  }
}

// REST API for initial state
app.get('/api/messages', (req, res) => {
  const convId = getLatestConversationId();
  const messages = parseTranscript(convId);
  return res.json({ success: true, conversationId: convId, messages });
});

// REST API to post new message from mobile
app.post('/api/send', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const cdpRes = await sendPromptViaCdp(prompt.trim());
  return res.json({ success: true, cdpResult: cdpRes });
});

// WebSocket real-time broadcast
let activeConversationId = getLatestConversationId();
let lastLogSize = 0;

setInterval(() => {
  const currentConvId = getLatestConversationId();
  if (currentConvId) {
    const logFile = path.join(BRAIN_DIR, currentConvId, '.system_generated', 'logs', 'transcript.jsonl');
    if (fs.existsSync(logFile)) {
      const stat = fs.statSync(logFile);
      if (stat.size !== lastLogSize || currentConvId !== activeConversationId) {
        lastLogSize = stat.size;
        activeConversationId = currentConvId;
        const messages = parseTranscript(currentConvId);

        const payload = JSON.stringify({ type: 'SYNC_MESSAGES', messages });
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      }
    }
  }
}, 1000);

const localIp = getLocalIp();
const mobileUrl = `http://${localIp}:${PORT}`;

server.listen(PORT, '0.0.0.0', () => {
  console.log('================================================================');
  console.log('🚀 Antigravity Mobile Web Bridge is RUNNING!');
  console.log(`📱 Open on your mobile phone: ${mobileUrl}`);
  console.log('================================================================\n');
  console.log('Scan this QR code with your phone (same Wi-Fi):');
  qrcode.generate(mobileUrl, { small: true });
  console.log('\n================================================================');
});
