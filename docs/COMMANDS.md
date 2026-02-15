# Commands Reference

Chat commands available on js-chat-server.

---

Generally, mentions are done by saying the exact username.  
Username: Arun440

| Message | Correct |
| :--- | :---: |
| Arun440 Hey check out this cool article I found http://... | Yes |
| yea i heard Arun440 was working on it | Yes |
| @Arun440 im still waiting, eta? | No |
| Arun440: yea i was working on that yesterday | No |

The last two examples are Discord-like and IRC-like.


---

## How Commands Work

Send commands as chat messages starting with `/`:

```json
{
  "type": "chat",
  "token": "<token>",
  "content": "/nick Alice"
}
```

---

## Built-in Commands

These commands are implemented in the server.

### `/help`
Show available commands.

```
/help
```

### `/nick <newname>`
Change your username.

```
/nick CoolUser
```

**Notes:**
- Disabled on servers with authentication enabled
- Has cooldown (default: 30-60 seconds)
- Username must be unique, 3-20 chars, alphanumeric + underscore/dash

### `/list`
List all online users.

```
/list
```

Shows `[B]Username` for users you've blocked.

### `/block <username>`
Block a user's messages for 12 hours (server-side).

```
/block SpamUser
```

### `/unblock <username>`
Unblock a user.

```
/unblock SpamUser
```

---

## Admin Commands

Requires:
* Admin privileges (configured in server's `admins.json`)
* Authentication enabled (configured in server's `settings.json`)

### `/kick <username>`
Disconnect a user from the server.

```
/kick TrollUser
```

### `/ban <username>`
Permanently ban a user.

```
/ban SpamBot
```

Banned users cannot reconnect. List stored in `banned.json`.

### `/unban <username>`
Remove a user from the ban list.

```
/unban ReformedUser
```