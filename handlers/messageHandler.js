const { saveMessage } = require('../utils/db');

module.exports = (socket, wss, broadcast, settings, adminUsers, handleCommand) => {
  const messageTimestamps = [];

  return (msg) => {
    let parsed;

    try {
      parsed = JSON.parse(msg);
    } catch {
      sendSystem(socket, 'Invalid message format.');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      sendSystem(socket, 'Invalid message format.');
      return;
    }

    const nowISO = new Date().toISOString();

    if (parsed.type === 'ping') {
      socket.lastHeartbeat = Date.now();
      socket.isAlive = true;

      socket.send(JSON.stringify({
        type: 'pong',
        timestamp: nowISO,
      }));

      return;
    }

    if (typeof parsed.type === 'string' && parsed.type.startsWith('webrtc-')) {
      const sfu = wss.webrtcSFU;

      if (!sfu) {
        socket.send(JSON.stringify({
          type: 'webrtc-error',
          error: 'WebRTC not initialized',
          timestamp: nowISO,
        }));
        return;
      }

      if (parsed.token !== socket.sessionToken) {
        socket.send(JSON.stringify({
          type: 'webrtc-error',
          error: 'Invalid session token',
          timestamp: nowISO,
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
            timestamp: nowISO,
          }));
      }

      return;
    }

    if (parsed.token !== socket.sessionToken) {
      sendSystem(socket, 'Invalid session token.');
      return;
    }

    if (parsed.type === 'typing') {
      if (!socket.username) return;

      const typingMsg = JSON.stringify({
        type: 'typing',
        username: socket.username,
        timestamp: nowISO,
      });

      wss.clients.forEach(client => {
        if (
          client !== socket &&
          client.readyState === 1 &&
          (!settings.authentication || client.authenticated)
        ) {
          client.send(typingMsg);
        }
      });

      return;
    }

    if (parsed.type !== 'chat' || typeof parsed.content !== 'string') {
      sendSystem(socket, 'Invalid message structure.');
      return;
    }

    const now = Date.now();

    messageTimestamps.push(now);

    while (messageTimestamps.length && now - messageTimestamps[0] > 1000) {
      messageTimestamps.shift();
    }

    const rateLimit = settings.maxMessagesPerSecond || 5;

    if (messageTimestamps.length > rateLimit) {
      sendSystem(socket, `Rate limit exceeded (${rateLimit}/sec)`);
      return;
    }

    let text = parsed.content.trim();

    if (text.length > 2000) {
      sendSystem(socket, 'Max length is 2000 characters.');
      return;
    }

    if (Buffer.byteLength(text, 'utf8') > 5120) {
      sendSystem(socket, 'Max size is 5KB.');
      return;
    }

    if (handleCommand(text, socket, wss, broadcast, settings, adminUsers)) {
      return;
    }

    const messageObj = {
      type: 'chat',
      username: socket.username,
      text,
      timestamp: nowISO,
    };

    saveMessage(messageObj);

    broadcast(wss, messageObj, settings);
  };
};