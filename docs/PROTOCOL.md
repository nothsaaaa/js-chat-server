# Protocol Specification

Wire protocol reference for js-chat-server.

---

## Overview

* **Transport:** WebSocket (RFC 6455)
* **Format:** UTF-8 JSON messages
* **URL:** `ws://host:port?username=optional`
* **Auth:** Session token (sent on connect)

### Connection Sequence
1. Client connects
2. Server sends `session-token`
3. Server sends `heartbeat-config`
4. Server sends `history`
5. Ready to chat

---

## Message Format

All messages are JSON objects:

```json
{
  "type": "message-type",
  "token": "your-session-token",
  ...
}
```

**Every outgoing message (except initial connection) requires your session token.**

---

## Client → Server

### Chat Message

```json
{
  "type": "chat",
  "token": "<token>",
  "content": "Hello!"
}
```

* `content`: Max 2000 chars, 5KB UTF-8
* Commands start with `/` (e.g., `/nick Alice`)
* Rate limited (default: 3 msg/sec)

### Ping (Heartbeat)

```json
{
  "type": "ping",
  "token": "<token>"
}
```

Send every N seconds (server tells you N). Miss deadline = disconnect.

### WebRTC Messages

Format:
```json
{
  "type": "webrtc-<action>",
  "token": "<token>",
  ...
}
```

**Types:** `webrtc-join`, `webrtc-leave`, `webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate`, `webrtc-media-change`

See [WEBRTC.md](WEBRTC.md) for details.

---

## Server → Client

### Session Token
```json
{ "type": "session-token", "token": "abc123..." }
```
**Save this!** Required for all your messages.

### Heartbeat Config
```json
{ "type": "heartbeat-config", "interval": 30000, "timeout": 35000 }
```
Ping every `interval` ms or get disconnected after `timeout` ms.

### Pong
```json
{ "type": "pong", "timestamp": 1709251234567 }
```
Response to your ping.

### Chat History
```json
{
  "type": "history",
  "messages": [
    { "type": "chat", "username": "Alice", "text": "Hi!", "timestamp": "2025-..." },
    { "type": "system", "username": null, "text": "Bob joined", "timestamp": "2025-..." }
  ]
}
```

### Chat Message
```json
{
  "type": "chat",
  "username": "Alice",
  "text": "Hello!",
  "timestamp": "2025-05-28T15:05:00.000Z"
}
```

### System Message
```json
{ "type": "system", "text": "Alice has joined." }
```

**Common system messages:**
* Join/leave notifications
* Nickname changes
* Errors (invalid token, rate limit, etc.)

### WebRTC Messages

See [WEBRTC.md](WEBRTC.md) for complete list.

---

## Limits & Errors

| Limit | Value |
|-------|-------|
| Max message length | 2000 chars |
| Max UTF-8 size | 5KB |
| Rate limit | ~3 msg/sec (server config) |
| Heartbeat interval | 30 sec (server tells you) |
| Heartbeat timeout | 35 sec (server tells you) |

---

## Connection States

```
CONNECTING → Receive token → Start heartbeat → ACTIVE
```

---

## Implementation Checklist

**Required:**
- [X] Save and use session token
- [X] Send heartbeat pings
- [X] Handle `chat`/`system` messages

**Recommended:**
- [ ] Handle `history` messages

**Optional:**
- [ ] WebRTC voice/video

---

## Further Reading

* **[QUICKSTART.md](QUICKSTART.md)**
* **[COMMANDS.md](COMMANDS.md)**
* **[WEBRTC.md](WEBRTC.md)**
* **[EXAMPLES.md](EXAMPLES.md)**