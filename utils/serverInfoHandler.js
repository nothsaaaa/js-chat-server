module.exports = (req, res, wss, settings) => {
  if (req.url !== '/info' && req.url !== '/server-info') {
    return false;
  }

  const webrtcConfig = settings.webrtc || {};
  
  const serverInfo = {
    serverName: settings.serverName || 'Chat Server',
    motd: settings.motd || '',
    authentication: settings.authentication || false,
    maxMessagesPerSecond: settings.maxMessagesPerSecond || 3,
    maxMessageLength: 2000,
    maxMessageBytes: 5120,
    usernameRequirements: {
      minLength: 3,
      maxLength: 20,
      pattern: '^[A-Za-z0-9_-]+$',
      description: '3-20 characters, alphanumeric plus underscore and hyphen'
    },
    connectionLimits: {
      totalMaxConnections: settings.totalMaxConnections || 20,
      maxConnectionsPerIP: settings.maxTotalConnections || 4,
      maxConnectionsPerWindow: settings.maxConnectionsPerWindow || 2,
      connectionWindowMs: settings.connectionWindowMs || 30000,
    },
    heartbeat: {
      interval: settings.heartbeatInterval || 30000,
      timeout: settings.heartbeatTimeout || 35000,
    },
    features: {
      nickChange: true,
      nickChangeCooldown: settings.nickChangeCooldown || 30000,
      userBlocking: true,
      blockDuration: 12 * 60 * 60 * 1000, // 12 hours
      messageHistory: true,
    },
    voice: {
      enabled: webrtcConfig.enabled === true,
      maxParticipants: webrtcConfig.maxParticipants || 8,
      allowVideo: webrtcConfig.allowVideo === true,
      allowScreenShare: webrtcConfig.allowScreenShare === true,
      forceRelay: webrtcConfig.forceRelay === true,
      supportedMediaTypes: (() => {
        const types = ['audio'];
        if (webrtcConfig.allowVideo) types.push('video');
        if (webrtcConfig.allowScreenShare) types.push('screen');
        return types;
      })(),
    },
    currentStats: {
      connectedUsers: wss.clients.size,
      voiceParticipants: wss.webrtcSFU ? wss.webrtcSFU.getParticipantCount() : 0,
    },
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  
  res.end(JSON.stringify(serverInfo, null, 2));
  return true;
};