const ipConnectionTimestamps = new Map();

module.exports = (ip, socket, wss, settings) => {
  const totalMaxConnections = settings.totalMaxConnections || 100;
  if (wss.clients.size >= totalMaxConnections) {
    socket.send(JSON.stringify({
      type: 'system',
      text: 'Server is full. Please try again later.',
    }));
    socket.close();
    return false;
  }

  const now = Date.now();
  const windowSize = settings.connectionRateLimitWindow || 30000;
  const maxPerIP = settings.connectionLimitPerIP || 2;

  const timestamps = ipConnectionTimestamps.get(ip) || [];
  const recent = timestamps.filter(ts => now - ts < windowSize);
  recent.push(now);
  ipConnectionTimestamps.set(ip, recent);

  if (recent.length > maxPerIP) {
    socket.send(JSON.stringify({
      type: 'system',
      text: `Too many connections from this IP. Limit is ${maxPerIP} every ${windowSize / 1000} seconds.`,
    }));
    socket.close();
    return false;
  }

  return true;
};
