# Quickstart Guide

## Key Concepts

### 1. Connection Flow
```
Connect → Receive token → Start heartbeat → Receive history → Chat!
```

### 2. Required Implementation
- **Save session token** from first message
- **Send ping** every N seconds (server tells you the interval)
- **Include token** in every message you send

### 3. Message Format
```javascript
// Sending
ws.send(JSON.stringify({
  type: 'chat',
  token: yourToken,
  content: 'Hello!'
}));

// Receiving
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // Handle msg.type: session-token, heartbeat-config, chat, system, history
};
```

---

## Try Commands

* `/help` - List commands
* `/nick NewName` - Change username
* `/list` - See who's online

See [COMMANDS.md](COMMANDS.md) for more.

---

## Next Steps

* **[PROTOCOL.md](PROTOCOL.md)**
* **[WEBRTC.md](WEBRTC.md)**
* **[EXAMPLES.md](EXAMPLES.md)**