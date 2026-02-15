# WebRTC Voice/Video Chat Guide

**Incomplete** guide to implementing voice and video chat in your client.

---

## Overview

js-chat-server supports real-time voice and video chat using WebRTC. The server acts as a **signaling server**, meaning:

* Server relays WebRTC signaling messages (offers, answers, ICE candidates) between peers
* Clients establish direct peer-to-peer (P2P) connections with each other
* Audio/video streams flow directly between clients, not through the server
* Optional: `forceRelay: true` forces all traffic through TURN servers (prevents IP leaks while maintaining P2P architecture)

### Mesh (P2P) Architecture

**How it works:**
```
Server: Signaling only (WebSocket)
  ↓ ↓ ↓
 A ←→ B    (Direct P2P connection)
 ↓  ╳ ↓
 C ←→ D    (Direct P2P connection)

4 users = 6 P2P connections (N × (N-1) / 2)
```

Each client connects directly to every other participant. The server only relays the initial WebRTC handshake messages.

**Benefits:**
* Lower server bandwidth (no media routing)
* Lower latency (direct connections)
* No server-side media processing

**Trade-offs:**
* Upload bandwidth scales with participants (each client uploads to N-1 peers)
* Connection count grows quadratically (N² connections total)
* Works well for small groups (2-8 participants)
* May struggle on weak connections with many participants

---

## Prerequisites

### Browser Requirements

* Modern browser with WebRTC support
* Microphone/camera permissions

### Client Requirements

* WebSocket connection established
* Session token obtained
* Basic chat functionality working

---

## Quick Start

### 1. Get User Media

```javascript
let localStream = null;

async function getMediaStream(audio = true, video = true) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: audio,
      video: video ? { width: 1280, height: 720 } : false
    });
    
    // Display local video
    const localVideo = document.getElementById('localVideo');
    localVideo.srcObject = localStream;
    
    return localStream;
  } catch (error) {
    console.error('Failed to get media:', error);
    throw error;
  }
}
```

---

### 2. Join Voice Chat

```javascript
const peerConnections = new Map(); // username -> RTCPeerConnection

async function joinVoiceChat(withVideo = false) {
  // Get media first
  await getMediaStream(true, withVideo);
  
  // Send join message
  ws.send(JSON.stringify({
    type: 'webrtc-join',
    token: sessionToken,
    mediaTypes: withVideo ? ['audio', 'video'] : ['audio']
  }));
}
```

---

### 3. Handle Server Response

```javascript
ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'webrtc-joined':
      handleVoiceChatJoined(msg);
      break;
      
    case 'webrtc-peer-joined':
      await handlePeerJoined(msg);
      break;
      
    case 'webrtc-peer-left':
      handlePeerLeft(msg);
      break;
      
    case 'webrtc-offer':
      await handleOffer(msg);
      break;
      
    case 'webrtc-answer':
      await handleAnswer(msg);
      break;
      
    case 'webrtc-ice-candidate':
      await handleIceCandidate(msg);
      break;
      
    case 'webrtc-media-changed':
      handleMediaChanged(msg);
      break;
      
    case 'webrtc-error':
      handleWebRTCError(msg);
      break;
  }
};
```

