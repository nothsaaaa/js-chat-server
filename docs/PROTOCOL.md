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

## Timezone Support

The server's `timezone` setting controls how timestamps are formatted in all messages. By default it is `'UTC'`, but you can set any IANA timezone name (e.g., `"America/New_York"`, `"Asia/Tokyo"`). On the `/server-info` endpoint, clients receive both:

* **`configured`** - the server's configured timezone
* **`actual`** - the system locale timezone (for display reference)

**Client guidance:** Fetch the server's `timezone` from `/server-info` and use it to format all received timestamps. The examples in this repo show how to do that with `Intl.DateTimeFormat`. If you don't fetch the timezone, messages will still be valid — they simply include a fixed offset instead of the local time zone.

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
Browsers may throttle timers when a tab is inactive or in the background. Clients should continue sending pings as scheduled but should not assume exact timing guarantees.

```json
{
  "type": "ping",
  "token": "<token>"
}
```

Send every N seconds (server tells you N). Miss deadline = disconnect.

### Typing Indicator *(optional)*

```json
{
  "type": "typing",
  "token": "<token>"
}
```

Signals that you are actively typing. The server broadcasts this to all other clients with your username attached. This is entirely optional — clients that don't send it simply won’t appear in others’ typing indicators, and clients that don’t handle the incoming message can safely ignore it.

**Recommended sending pattern:**
- Send immediately on the first keypress of a new typing session
- Re-send every ~5 seconds while the user continues typing
- Stop sending ~1–2 seconds after the last keypress
- No “stopped typing” message is needed — recipients should expire the indicator ~6 seconds after the last update received

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
{ "type": "heartbeat-config", "interval": 30000, "timeout": 120000 }
```
Ping every `interval` ms or get disconnected after `timeout` ms.


---

### Pong
```json
{
  "type": "pong",
  "timestamp": "2027-08-30T15:30:00+02:00"
}
```

### Chat History
```json
{
  "type": "history",
  "messages": [
    { "type": "chat", "username": "Alice", "text": "Hi!", "timestamp": "2027-08-30T15:30:00+02:00" },
    { "type": "system", "username": null, "text": "Bob joined", "timestamp": "2027-08-30T15:30:00+02:00" }
  ]
}
```

### Chat Message
```json
{
  "type": "chat",
  "username": "Alice",
  "text": "Hello!",
  "timestamp": "2027-08-30T15:30:00+02:00"
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

### Typing Indicator
```json
{
  "type": "typing",
  "username": "Alice",
  "timestamp": "2027-08-30T15:30:00+02:00"
}
```

Broadcast when another client is actively typing. Safe to ignore entirely if your client doesn’t implement typing indicators. Expires naturally, no “stopped typing” event is sent; **treat the user as having stopped 6 seconds after the last `typing` received from them.**

### WebRTC Messages

See [WEBRTC.md](WEBRTC.md) for complete list.

---

## Limits & Errors

| Limit | Value |
|-------|-------|
| Max message length | 2000 chars |
| Max UTF-8 size | 5KB |
| Rate limit | ~3 msg/sec (server config) |
| Heartbeat interval | ~30 sec (server tells you) |
| Heartbeat timeout | ~120 sec (server tells you) |

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
- [ ] Handle `typing` messages to show who is typing
- [ ] Send `typing` messages while the user types
- [ ] WebRTC voice/video
