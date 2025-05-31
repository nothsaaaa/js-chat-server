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
        text: 'Invalid message format. Messages must be JSON.',
      }));
      return;
    }

    if (parsed.type === 'ping') {
      return;
    }

    if (parsed.type !== 'message' || typeof parsed.content !== 'string') {
      socket.send(JSON.stringify({
        type: 'system',
        text: 'Invalid message structure. Must be: { "type": "message", "content": "..." }',
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
