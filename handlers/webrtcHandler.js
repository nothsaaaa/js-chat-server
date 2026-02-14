const { saveMessage } = require('../utils/db');

class WebRTCSFU {
  constructor(wss, settings) {
    this.wss = wss;
    this.settings = settings;
    
    this.participants = new Map();

    this.pendingIceCandidates = new Map();
  }

  isEnabled() {
    return this.settings.webrtc && this.settings.webrtc.enabled === true;
  }

  getParticipantCount() {
    return this.participants.size;
  }

  getMaxParticipants() {
    return this.settings.webrtc?.maxParticipants || 8;
  }


  isFull() {
    return this.getParticipantCount() >= this.getMaxParticipants();
  }

  getParticipantList() {
    return Array.from(this.participants.entries()).map(([socket, data]) => ({
      username: data.username,
      mediaTypes: Array.from(data.mediaTypes),
    }));
  }

  handleJoinVoice(socket, data) {
    if (!this.isEnabled()) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'WebRTC is disabled on this server',
      }));
      return;
    }

    if (!socket.username) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'Must be authenticated to join voice chat',
      }));
      return;
    }

    if (this.participants.has(socket)) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'Already in voice chat',
      }));
      return;
    }

    if (this.isFull()) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: `Voice chat is full (${this.getMaxParticipants()} maximum)`,
      }));
      return;
    }

    const requestedMedia = new Set(data.mediaTypes || ['audio']);
    const allowedMedia = new Set(['audio']);
    
    if (this.settings.webrtc.allowVideo) {
      allowedMedia.add('video');
    }
    
    if (this.settings.webrtc.allowScreenShare) {
      allowedMedia.add('screen');
    }

    const mediaTypes = new Set(
      Array.from(requestedMedia).filter(type => allowedMedia.has(type))
    );

    if (mediaTypes.size === 0) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'No valid media types requested',
      }));
      return;
    }

    this.participants.set(socket, {
      username: socket.username,
      mediaTypes: mediaTypes,
    });

    this.pendingIceCandidates.set(socket, new Map());

    socket.send(JSON.stringify({
      type: 'webrtc-joined',
      participants: this.getParticipantList(),
      config: {
        allowVideo: this.settings.webrtc.allowVideo,
        allowScreenShare: this.settings.webrtc.allowScreenShare,
        forceRelay: this.settings.webrtc.forceRelay,
      },
    }));

    this.broadcastToParticipants({
      type: 'webrtc-peer-joined',
      username: socket.username,
      mediaTypes: Array.from(mediaTypes),
    }, socket);

    const joinMsg = {
      type: 'system',
      text: `${socket.username} joined voice chat`,
    };
    
    this.broadcastToAll(joinMsg);
    saveMessage(joinMsg);

    console.log(`[WEBRTC] ${socket.username} joined voice chat (${this.getParticipantCount()}/${this.getMaxParticipants()})`);
  }

  handleLeaveVoice(socket) {
    if (!this.participants.has(socket)) {
      return;
    }

    const participantData = this.participants.get(socket);
    this.participants.delete(socket);
    this.pendingIceCandidates.delete(socket);

    this.broadcastToParticipants({
      type: 'webrtc-peer-left',
      username: participantData.username,
    }, socket);

    const leaveMsg = {
      type: 'system',
      text: `${participantData.username} left voice chat`,
    };
    
    this.broadcastToAll(leaveMsg);
    saveMessage(leaveMsg);

    console.log(`[WEBRTC] ${participantData.username} left voice chat (${this.getParticipantCount()}/${this.getMaxParticipants()})`);
  }

  handleOffer(socket, data) {
    if (!this.participants.has(socket)) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'Not in voice chat',
      }));
      return;
    }

    const { targetUsername, offer } = data;

    if (!targetUsername || !offer) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'Invalid offer data',
      }));
      return;
    }

    const targetSocket = this.findSocketByUsername(targetUsername);
    
    if (!targetSocket || !this.participants.has(targetSocket)) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'Target user not in voice chat',
      }));
      return;
    }

    targetSocket.send(JSON.stringify({
      type: 'webrtc-offer',
      fromUsername: socket.username,
      offer: offer,
    }));

    console.log(`[WEBRTC] Relayed offer: ${socket.username} → ${targetUsername}`);
  }

  handleAnswer(socket, data) {
    if (!this.participants.has(socket)) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'Not in voice chat',
      }));
      return;
    }

    const { targetUsername, answer } = data;

    if (!targetUsername || !answer) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'Invalid answer data',
      }));
      return;
    }

    const targetSocket = this.findSocketByUsername(targetUsername);
    
    if (!targetSocket || !this.participants.has(targetSocket)) {
      socket.send(JSON.stringify({
        type: 'webrtc-error',
        error: 'Target user not in voice chat',
      }));
      return;
    }

    targetSocket.send(JSON.stringify({
      type: 'webrtc-answer',
      fromUsername: socket.username,
      answer: answer,
    }));

    this.flushPendingIceCandidates(socket, targetSocket);

    console.log(`[WEBRTC] Relayed answer: ${socket.username} → ${targetUsername}`);
  }

  handleIceCandidate(socket, data) {
    if (!this.participants.has(socket)) {
      return;
    }

    const { targetUsername, candidate } = data;

    if (!targetUsername || !candidate) {
      return;
    }

    const targetSocket = this.findSocketByUsername(targetUsername);
    
    if (!targetSocket || !this.participants.has(targetSocket)) {
      return;
    }

    const shouldBuffer = data.buffer === true;

    if (shouldBuffer) {
      const targetPendingMap = this.pendingIceCandidates.get(targetSocket);
      if (!targetPendingMap.has(socket)) {
        targetPendingMap.set(socket, []);
      }
      targetPendingMap.get(socket).push(candidate);
      
      console.log(`[WEBRTC] Buffered ICE candidate: ${socket.username} → ${targetUsername}`);
    } else {
      targetSocket.send(JSON.stringify({
        type: 'webrtc-ice-candidate',
        fromUsername: socket.username,
        candidate: candidate,
      }));

      console.log(`[WEBRTC] Relayed ICE candidate: ${socket.username} → ${targetUsername}`);
    }
  }

  flushPendingIceCandidates(fromSocket, toSocket) {
    const toPendingMap = this.pendingIceCandidates.get(toSocket);
    
    if (!toPendingMap || !toPendingMap.has(fromSocket)) {
      return;
    }

    const bufferedCandidates = toPendingMap.get(fromSocket);
    
    bufferedCandidates.forEach(candidate => {
      toSocket.send(JSON.stringify({
        type: 'webrtc-ice-candidate',
        fromUsername: fromSocket.username,
        candidate: candidate,
      }));
    });

    console.log(`[WEBRTC] Flushed ${bufferedCandidates.length} ICE candidates: ${fromSocket.username} → ${toSocket.username}`);

    toPendingMap.delete(fromSocket);
  }

  handleMediaChange(socket, data) {
    if (!this.participants.has(socket)) {
      return;
    }

    const participantData = this.participants.get(socket);
    const { mediaTypes } = data;

    if (!Array.isArray(mediaTypes)) {
      return;
    }

    participantData.mediaTypes = new Set(mediaTypes);

    this.broadcastToParticipants({
      type: 'webrtc-media-changed',
      username: socket.username,
      mediaTypes: mediaTypes,
    }, socket);

    console.log(`[WEBRTC] ${socket.username} media changed:`, mediaTypes);
  }

  findSocketByUsername(username) {
    for (const client of this.wss.clients) {
      if (client.username === username) {
        return client;
      }
    }
    return null;
  }

  broadcastToParticipants(message, excludeSocket = null) {
    this.participants.forEach((data, socket) => {
      if (socket !== excludeSocket && socket.readyState === 1) {
        socket.send(JSON.stringify(message));
      }
    });
  }

  broadcastToAll(message) {
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(message));
      }
    });
  }

  handleDisconnect(socket) {
    if (this.participants.has(socket)) {
      this.handleLeaveVoice(socket);
    }
  }
}

module.exports = (wss, settings) => {
  const sfu = new WebRTCSFU(wss, settings);

  wss.webrtcSFU = sfu;

  console.log('[WEBRTC] SFU initialized -', 
    sfu.isEnabled() ? `Enabled (max ${sfu.getMaxParticipants()} participants)` : 'Disabled'
  );

  return sfu;
};