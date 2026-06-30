# Example Clients

Reference implementations demonstrating different approaches and features.

---

### Connection Management

All examples follow this pattern:

```javascript
// 1. Connect
const ws = new WebSocket(url);

// 2. Authenticate (save token)
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'session-token') {
    token = msg.token;
  }
};

// 3. Start heartbeat
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping', token }));
}, heartbeatInterval);

// 4. Handle messages
// 5. Send messages with token
```
* **[Commands Reference](COMMANDS.md)**
* **[WebRTC Guide](WEBRTC.md)**
