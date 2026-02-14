const crypto = require('crypto');

console.log('Loading loadSettings');
const loadSettings = require('../handlers/loadSettings');
console.log('Loading loadBansAndAdmins');
const loadBansAndAdmins = require('../handlers/loadBansAndAdmins');
console.log('Loading connectionLimiter');
const connectionLimiter = require('../handlers/connectionLimiter');
console.log('Loading broadcast');
const broadcast = require('../handlers/broadcast');
console.log('Loading authHandler');
const authHandler = require('../handlers/authHandler');
console.log('Loading unauthHandler');
const unauthHandler = require('../handlers/unauthHandler');
console.log('Loading colorUtils');
const { clampUsername } = require('../utils/colorUtils');
console.log('Loading generateUsername');
const generateUsername = require('../utils/generateUsername');
console.log('Loading connectionLogger');
const connectionLogger = require('../middleware/connectionLogger');
console.log('Loading commands');
const handleCommand = require('../utils/commands');
console.log('Loading loginLimiter');
const loginLimiter = require('../utils/loginLimiter');

module.exports = (socket, req, wss) => {
  const ip = req.socket.remoteAddress;
  const settings = loadSettings();
  const { bannedUsers, adminUsers } = loadBansAndAdmins();

  if (!connectionLimiter(ip, socket, wss, settings)) return;

  if (!wss.usernames) wss.usernames = new Set();
  if (!wss.authenticatedClients) wss.authenticatedClients = new Set();

  socket.blockedUsers = new Set();

  // SESSION TOKEN HOLY SHIT
  socket.sessionToken = crypto.randomBytes(32).toString('hex');
  socket.send(JSON.stringify({
    type: 'session-token',
    token: socket.sessionToken,
  }));

  socket.isAlive = true;
  socket.lastHeartbeat = Date.now();
  
  const heartbeatTimeout = settings.heartbeatTimeout || 35000;
  const heartbeatInterval = settings.heartbeatInterval || 30000;
  
  socket.send(JSON.stringify({
    type: 'heartbeat-config',
    interval: heartbeatInterval,
    timeout: heartbeatTimeout,
  }));
  
  socket.heartbeatTimer = setInterval(() => {
    const timeSinceLastBeat = Date.now() - socket.lastHeartbeat;
    
    if (timeSinceLastBeat > heartbeatTimeout) {
      console.log(`[HEARTBEAT TIMEOUT] Disconnecting ${socket.username || 'unauthenticated'} - No ping for ${timeSinceLastBeat}ms`);
      
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Disconnected: Heartbeat timeout (no ping received)',
      }));
      
      socket.close(1008, 'Heartbeat timeout');
      return;
    }
  }, heartbeatInterval);

  if (settings.authentication) {
    authHandler(socket, req, wss, settings, adminUsers, broadcast, loginLimiter, bannedUsers, connectionLogger, handleCommand);
  } else {
    unauthHandler(socket, req, wss, settings, bannedUsers, broadcast, generateUsername, clampUsername, connectionLogger, handleCommand);
  }

  socket.on('close', () => {
    if (socket.heartbeatTimer) {
      clearInterval(socket.heartbeatTimer);
    }
    
    if (socket.username) {
      connectionLogger('LEAVE', socket.username);
      wss.usernames.delete(socket.username);
      const leaveText = `${socket.username} has left.`;
      broadcast(wss, { type: 'system', text: leaveText }, settings);
      const { saveMessage } = require('../utils/db');
      saveMessage({ type: 'system', text: leaveText });
    }
  });

  socket.on('error', (err) => {
    console.error('WebSocket client error:', err);
  });
};