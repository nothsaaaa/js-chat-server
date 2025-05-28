# js-chat-server
lightweight chatserver written in javascript

---

## Overview

The server is a WebSocket server. It allows multiple clients to:

* Connect with or without a username
* Receive chat and system messages
* Change their nickname
* View recent chat history on connection

---

## Components

* **`app.js`**
  Entry point.

* **`routes/websocket.js`**
  Handles WebSocket connections, message parsing, broadcasting, and user state.

* **`utils/db.js`**
  Handles SQLite database connection and queries for saving and retrieving messages.

* **`utils/generateUsername.js` & `utils/colorUtils.js`**
  Helpers to generate and sanitize usernames.

* **`middleware/connectionLogger.js`**
  Logs join/leave events on the server console.

---

## How Connections Work

1. Client connects to the WebSocket server URL:
   `ws://localhost:3000` or with username query param:
   `ws://localhost:3000?username=YourName`

2. The server assigns or clamps the username.

3. The server sends the client the recent chat history (up to 100 messages).

4. The server broadcasts a system message announcing the user joined.

5. The client can send chat messages or a nickname change command (`/nick NewName`).

6. On client disconnect, the server broadcasts a system leave message.

---

## Message Format

### Client-to-Server

* Plain text string for chat messages.
* Nickname change command:
  `/nick NewName`

### Server-to-Client

All server messages are JSON strings with this general shape:

```json
{
  "type": "chat" | "system" | "history",
  "username": "UserName",    // present for chat messages, null for system
  "text": "Message text",
  "timestamp": "ISO 8601 timestamp" // present for chat messages, optional for system
}
```

* **`type: "history"`**
  Contains an array of past messages under `messages`.

* **`type: "chat"`**
  A user’s chat message.

* **`type: "system"`**
  Server system messages like joins, leaves, or nickname changes.

---

## Database

* Uses SQLite (`chat.db`) to store all messages persistently.
* Messages table schema:

| Column    | Type     | Description                            |
| --------- | -------- | -------------------------------------- |
| id        | INTEGER  | Primary key, auto-increment            |
| type      | TEXT     | 'chat' or 'system'                     |
| username  | TEXT     | Username for chat, nullable for system |
| text      | TEXT     | Message content                        |
| timestamp | DATETIME | Defaults to current timestamp          |

* On server startup, the table is created if missing.
* All chat and system messages are saved for history retrieval.

---

## Commands

* **Change Nickname**

  Clients send a message starting with `/nick` followed by the new username:

  ```
  /nick NewName
  ```

  The server updates the username and broadcasts a system message:

  ```
  OldName is now NewName
  ```

---

## Logging

* Join and leave events are logged on the server console via `connectionLogger`.

---

## Running the Server

1. Ensure you have Node.js installed.
2. Run the server with:

```bash
node app.js
```

3. By default, listens on port 3000 or the port set in the environment variable `PORT`.