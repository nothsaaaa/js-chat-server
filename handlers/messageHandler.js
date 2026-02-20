const { saveMessage } = require('../utils/db');

module.exports = (socket, wss, broadcast, settings, adminUsers, handleCommand) => {
  const messageTimestamps = [];

  return (msg) => {
    let parsed;
    try {
      parsed = JSON.parse(msg);
    } catch {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Invalid message format.',
      }));
      return;
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Invalid message format.',
      }));
      return;
    }

    if (parsed.type === 'ping') {
      socket.lastHeartbeat = Date.now();
      socket.isAlive = true;
      
      socket.send(JSON.stringify({ 
        type: 'pong',
        timestamp: socket.lastHeartbeat,
      }));
      
      return;
    }

    if (typeof parsed.type === 'string' && parsed.type.startsWith('webrtc-')) {
      const sfu = wss.webrtcSFU;
      
      if (!sfu) {
        socket.send(JSON.stringify({
          type: 'webrtc-error',
          error: 'WebRTC not initialized',
        }));
        return;
      }

      if (typeof parsed.token !== 'string' || parsed.token !== socket.sessionToken) {
        socket.send(JSON.stringify({
          type: 'webrtc-error',
          error: 'Invalid session token',
        }));
        return;
      }

      switch (parsed.type) {
        case 'webrtc-join':
          sfu.handleJoinVoice(socket, parsed);
          break;
        case 'webrtc-leave':
          sfu.handleLeaveVoice(socket);
          break;
        case 'webrtc-offer':
          sfu.handleOffer(socket, parsed);
          break;
        case 'webrtc-answer':
          sfu.handleAnswer(socket, parsed);
          break;
        case 'webrtc-ice-candidate':
          sfu.handleIceCandidate(socket, parsed);
          break;
        case 'webrtc-media-change':
          sfu.handleMediaChange(socket, parsed);
          break;
        default:
          socket.send(JSON.stringify({
            type: 'webrtc-error',
            error: 'Unknown WebRTC message type',
          }));
      }
      
      return;
    }

    if (typeof parsed.token !== 'string' || parsed.token !== socket.sessionToken) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Invalid session token.',
      }));
      return;
    }

    if (parsed.type === 'typing') {
      if (socket.username) {
        wss.clients.forEach((client) => {
          if (
            client !== socket &&
            client.readyState === 1 &&
            (!settings.authentication || client.authenticated)
          ) {
            client.send(JSON.stringify({
              type: 'typing',
              username: socket.username,
            }));
          }
        });
      }
      return;
    }

    if (parsed.type !== 'chat' || typeof parsed.content !== 'string') {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Invalid message structure.',
      }));
      return;
    }

    const now = Date.now();
    messageTimestamps.push(now);
    while (messageTimestamps.length && now - messageTimestamps[0] > 1000) {
      messageTimestamps.shift();
    }

    const rateLimit = settings.maxMessagesPerSecond || 5;
    if (messageTimestamps.length > rateLimit) {
      socket.send(JSON.stringify({
        type: 'system',
        text: `You are sending messages too fast. Limit is ${rateLimit} per second.`,
      }));
      return;
    }

    let text = parsed.content.trim();

    if (text.length > 2000) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Your message is too long. Max 2000 characters.',
      }));
      return;
    }

    if (Buffer.byteLength(text, 'utf-8') > 5120) {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Your message is too large. Max 5KB.',
      }));
      return;
    }

    if (handleCommand(text, socket, wss, broadcast, settings, adminUsers)) return;

    const messageObj = {
      type: 'chat',
      username: socket.username,
      text,
      timestamp: new Date().toISOString(),
    };

    saveMessage(messageObj);
    broadcast(wss, messageObj, settings);
  };
};