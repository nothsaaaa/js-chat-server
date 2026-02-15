# Example Clients

Reference implementations demonstrating different approaches and features.

---

## Overview

The `examples/clients/` directory contains working client implementations showcasing various features and programming approaches. Use these as:

* **Learning resources** - See how features are implemented
* **Starting templates** - Fork and customize for your needs

---

## Common Patterns

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

---

## Troubleshooting

### Example Won't Connect

1. Is server running? `netstat -an | grep 3000`
2. Correct URL? Check `ws://` vs `wss://`
3. CORS issues?
4. Check browser console for errors

---

## Further Reading

* **[Quickstart Guide](QUICKSTART.md)**
* **[Protocol Specification](PROTOCOL.md)**
* **[Commands Reference](COMMANDS.md)**
* **[WebRTC Guide](WEBRTC.md)**
