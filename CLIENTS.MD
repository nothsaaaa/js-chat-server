# WebSocket Chat Client Documentation


This document explains how to create a WebSocket client to connect and communicate with the chat server.
Example clients are in `examples/clients/`.


---


## Overview


The chat server uses a WebSocket connection to handle real-time messaging with optional WebRTC voice/video chat. Clients can:


* Connect with an optional username
* Receive chat and system messages
* Send chat messages and commands
* Maintain connection with periodic pings
* Join/leave WebRTC voice chat rooms
* Exchange WebRTC signaling for peer-to-peer audio/video


---


## Connecting to the Server


* You can optionally pass a username as a URL query parameter:


  ```
  ws://localhost:3000?username=YourName
  ```


* If no username is provided, the server assigns a random anonymous username.


* **Session Token**


  Upon connection, the server generates and sends a unique session token to your client in a message like this:


  ```json
  {
    "type": "session-token",
    "token": "<your-session-token>"
  }
  ```


  Your client **must** save this token and include it in **every** message you send to the server (except ping messages). Messages without the correct token will be rejected.


* **Heartbeat Configuration**


  Immediately after the session token, the server sends heartbeat requirements:


  ```json
  {
    "type": "heartbeat-config",
    "interval": 30000,
    "timeout": 35000
  }
  ```


  * `interval` (ms): How often your client should send ping messages
  * `timeout` (ms): Server will disconnect if no ping received within this time
  
  Your client should send ping messages at the specified interval to maintain the connection.


---


## Message Types


The server sends and expects JSON messages with the following types:


### Incoming Messages from Server


* **`session-token`**: Sent immediately on connection. Contains your unique session identifier.


  ```json
  {
    "type": "session-token",
    "token": "a1b2c3d4e5f6..."
  }
  ```


* **`heartbeat-config`**: Sent after session token. Specifies ping requirements.


  ```json
  {
    "type": "heartbeat-config",
    "interval": 30000,
    "timeout": 35000
  }
  ```


* **`pong`**: Response to your ping message. Confirms server is alive.


  ```json
  {
    "type": "pong",
    "timestamp": 1709251234567
  }
  ```


* **`history`**: Sent once on connection. Contains recent messages.


  ```json
  {
    "type": "history",
    "messages": [
      {
        "type": "chat" | "system",
        "username": "User1",  // null for system messages
        "text": "Message text",
        "timestamp": "2025-05-28T15:04:05.000Z"
      },
      ...
    ]
  }
  ```


* **`chat`**: Regular chat message from a user, after processing by the server (including filtering, commands, etc.)


  ```json
  {
    "type": "chat",
    "username": "User1",
    "text": "Hello everyone!",
    "timestamp": "2025-05-28T15:05:00.000Z"
  }
  ```


* **`system`**: System messages like joins, leaves, or nickname changes.


  ```json
  {
    "type": "system",
    "text": "User1 has joined."
  }
  ```


**WebRTC Messages** (see WebRTC section below for details):


* **`webrtc-joined`**: Confirmation that you joined voice chat
* **`webrtc-peer-joined`**: Another user joined voice chat
* **`webrtc-peer-left`**: Another user left voice chat
* **`webrtc-offer`**: WebRTC offer from another peer
* **`webrtc-answer`**: WebRTC answer from another peer
* **`webrtc-ice-candidate`**: ICE candidate from another peer
* **`webrtc-media-changed`**: Peer changed their media types (e.g., disabled video)
* **`webrtc-error`**: Error with WebRTC operation


---


## Sending Messages to the Server


* **General requirements**


  * All outgoing messages **must** be JSON strings with the following common structure:


    ```json
    {
      "type": "<message-type>",
      "token": "<your-session-token>",
      // other fields depending on type
    }
    ```


  * The server validates the `token` field against your session; messages with missing or invalid tokens are rejected.


* **Chat message**


  To send a chat message (including commands starting with `/`), send:


  ```js
  ws.send(JSON.stringify({
    type: "chat",
    token: "<your-session-token>",
    content: "Hello everyone!"
  }));
  ```


  * The `content` field must be a string.
  * Messages longer than 2000 characters or 5KB in UTF-8 size will be rejected.
  * Messages sent too frequently (more than the server's rate limit) will be rejected.
  * Commands like `/nick newname` or `/help` are handled internally by the server when sent as `content` in a `"chat"` message.


* **Ping (Heartbeat)**


  To maintain your connection, send a ping message at the interval specified in `heartbeat-config` (default: every 30 seconds):


  ```js
  ws.send(JSON.stringify({
    type: "ping",
    token: "<your-session-token>"
  }));
  ```


  * Failure to send ping messages will result in disconnection after the timeout period (default: 35 seconds).
  * The server responds with a `pong` message containing a timestamp.
  * The server uses this to detect dead connections (network failures, crashed clients, zombie connections).
  
  **Implementation Example:**
  ```js
  let heartbeatInterval;
  
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === 'heartbeat-config') {
      // Start heartbeat
      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({
          type: 'ping',
          token: sessionToken
        }));
      }, msg.interval);
    }
  };
  
  ws.onclose = () => {
    clearInterval(heartbeatInterval);
  };
  ```


---


## WebRTC Voice/Video Chat


If WebRTC is enabled on the server, clients can join a group voice/video chat room. The server acts as an SFU (Selective Forwarding Unit), relaying media streams between participants.


### Architecture


**SFU (Selective Forwarding Unit)**: Instead of connecting to every peer directly, clients send their media to the server, which forwards it to all other participants.


```
Traditional Mesh:        SFU Architecture:
A  B                        SFU
A  C                       / | \
A  D                      A  B  C
B  C
B  D
C  D
```


Benefits:
- Linear scaling (N connections vs N2/2)
- Lower client upload bandwidth (1 stream vs N-1 streams)
- Server controls capacity and permissions


### Joining Voice Chat


To join the voice chat room, first obtain your local media stream, then send:


```js
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: true, 
  video: true 
});


ws.send(JSON.stringify({
  type: "webrtc-join",
  token: "<your-session-token>",
  mediaTypes: ["audio", "video"]  // or just ["audio"] for audio-only
}));
```


**Server Response (Success):**
```json
{
  "type": "webrtc-joined",
  "participants": [
    {
      "username": "Ashlyn",
      "mediaTypes": ["audio", "video"]
    },
    {
      "username": "Bob",
      "mediaTypes": ["audio"]
    }
  ],
  "config": {
    "allowVideo": true,
    "allowScreenShare": true,
    "forceRelay": false
  }
}
```


**Server Response (Error):**
```json
{
  "type": "webrtc-error",
  "error": "Voice chat is full (8 maximum)"
}
```


### WebRTC Signaling Flow


Once in voice chat, you must establish peer connections with all other participants. The server relays WebRTC signaling messages.


**1. Create RTCPeerConnection for Each Peer**


```js
const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};


const pc = new RTCPeerConnection(iceConfig);


// Add your local tracks
localStream.getTracks().forEach(track => {
  pc.addTrack(track, localStream);
});


// Handle incoming tracks
pc.ontrack = (event) => {
  // Display remote stream in UI
  remoteVideo.srcObject = event.streams[0];
};


// Handle ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    ws.send(JSON.stringify({
      type: "webrtc-ice-candidate",
      token: sessionToken,
      targetUsername: "Bob",
      candidate: event.candidate,
      buffer: pc.remoteDescription === null
    }));
  }
};
```


**2. Send Offer (If You're the Initiator)**


```js
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);


ws.send(JSON.stringify({
  type: "webrtc-offer",
  token: sessionToken,
  targetUsername: "Bob",
  offer: offer
}));
```


**3. Receive Offer and Send Answer**


```js
ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'webrtc-offer') {
    const pc = peerConnections.get(msg.fromUsername);
    await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    ws.send(JSON.stringify({
      type: "webrtc-answer",
      token: sessionToken,
      targetUsername: msg.fromUsername,
      answer: answer
    }));
  }
};
```


**4. Handle Answer**


```js
if (msg.type === 'webrtc-answer') {
  const pc = peerConnections.get(msg.fromUsername);
  await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
}
```


**5. Exchange ICE Candidates**


```js
if (msg.type === 'webrtc-ice-candidate') {
  const pc = peerConnections.get(msg.fromUsername);
  if (pc.remoteDescription) {
    await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  }
}
```


### WebRTC Message Types


**Join Voice Chat:**
```json
{
  "type": "webrtc-join",
  "token": "<session-token>",
  "mediaTypes": ["audio", "video"]
}
```


**Leave Voice Chat:**
```json
{
  "type": "webrtc-leave",
  "token": "<session-token>"
}
```


**Send Offer:**
```json
{
  "type": "webrtc-offer",
  "token": "<session-token>",
  "targetUsername": "Bob",
  "offer": {
    "type": "offer",
    "sdp": "v=0\r\no=- ..."
  }
}
```


**Send Answer:**
```json
{
  "type": "webrtc-answer",
  "token": "<session-token>",
  "targetUsername": "Alice",
  "answer": {
    "type": "answer",
    "sdp": "v=0\r\no=- ..."
  }
}
```


**Send ICE Candidate:**
```json
{
  "type": "webrtc-ice-candidate",
  "token": "<session-token>",
  "targetUsername": "Bob",
  "candidate": {
    "candidate": "candidate:1 1 UDP ...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  },
  "buffer": false
}
```


**Change Media (Toggle Video/Audio):**
```json
{
  "type": "webrtc-media-change",
  "token": "<session-token>",
  "mediaTypes": ["audio"]
}
```


### Peer Events


**New Peer Joined:**
```json
{
  "type": "webrtc-peer-joined",
  "username": "Charlie",
  "mediaTypes": ["audio", "video"]
}
```
Your client should create a peer connection and send an offer to this user.


**Peer Left:**
```json
{
  "type": "webrtc-peer-left",
  "username": "Charlie"
}
```
Your client should close the peer connection and remove from UI.


**Peer Media Changed:**
```json
{
  "type": "webrtc-media-changed",
  "username": "Alice",
  "mediaTypes": ["audio"]
}
```
Update UI to reflect that peer disabled video.


### ICE Candidate Buffering


When sending ICE candidates **before** receiving an answer from the peer, set `buffer: true`:


```js
ws.send(JSON.stringify({
  type: "webrtc-ice-candidate",
  token: sessionToken,
  targetUsername: "Bob",
  candidate: event.candidate,
  buffer: pc.remoteDescription === null  // true if no remote desc yet
}));
```


The server will buffer these candidates and flush them after the answer is relayed, preventing race conditions.


---


### Notes


* Messages **must** be valid JSON strings.
* Clients should send ping messages at the configured interval to maintain the connection.
* Sending malformed JSON or missing the `token` will cause the server to send an error system message.
* The server broadcasts messages in JSON format to all connected clients.
* Your client should listen for `"history"` on connection and `"chat"` and `"system"` messages during the session.
* WebRTC requires HTTPS in production (browsers block getUserMedia on HTTP).
* For WebRTC to work through NATs/firewalls, configure STUN/TURN servers in your client's ICE configuration.