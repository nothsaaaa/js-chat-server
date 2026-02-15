module.exports = (req, res, wss, settings) => {
  if (req.url !== '/info' && req.url !== '/server-info') {
    return false;
  }

  const serverInfo = {
    serverName: settings.serverName,
    motd: settings.motd,
    port: settings.port,

    authentication: settings.authentication,

    maxMessagesPerSecond: settings.maxMessagesPerSecond,
    nickChangeCooldown: settings.nickChangeCooldown,

    connectionLimits: {
      totalMaxConnections: settings.totalMaxConnections,
      maxConnectionsPerIP: settings.maxTotalConnections,
      maxConnectionsPerWindow: settings.maxConnectionsPerWindow,
      connectionWindowMs: settings.connectionWindowMs,
    },

    heartbeat: {
      interval: settings.heartbeatInterval,
      timeout: settings.heartbeatTimeout,
    },

    webrtc: settings.webrtc
      ? {
          enabled: settings.webrtc.enabled,
          maxParticipants: settings.webrtc.maxParticipants,
          allowVideo: settings.webrtc.allowVideo,
          allowScreenShare: settings.webrtc.allowScreenShare,
          forceRelay: settings.webrtc.forceRelay,
        }
      : {
          enabled: false
        },

    currentStats: {
      connectedUsers: wss.clients.size,
      voiceParticipants:
        wss.webrtcSFU && typeof wss.webrtcSFU.getParticipantCount === 'function'
          ? wss.webrtcSFU.getParticipantCount()
          : 0,
    }
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });

  res.end(JSON.stringify(serverInfo, null, 2));
  return true;
};