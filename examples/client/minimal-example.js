// This is the best example client for learning how to make custom clients.
// The rest are intended for further functionality and inspiration, however lack in newer features.

const ws = new WebSocket('ws://localhost:8443?username=TestUser');
let token;

// Timezone configuration for the client.
// Defaults to whatever the server reports on /server-info so timestamps
// always display correctly in the user's local time.
let localTimezone = 'system'; // will be overridden by server info when available
// i.e. America/Chicago

function formatLocalTime(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  try {
    const opts = localTimezone && localTimezone !== 'system' ? { timeZone: localTimezone } : {};
    return d.toLocaleString('en-US', opts);
  } catch {
    return d.toUTCString();
  }
}

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'session-token') token = msg.token;
  if (msg.type === 'chat') {
    // Display the timestamp in local time if present, otherwise just show username and text.
    const ts = msg.timestamp ? formatLocalTime(msg.timestamp) : '';
    console.log(`${ts} ${msg.username}: ${msg.text}`);
  }
};

function send(text) {
  ws.send(JSON.stringify({ type: 'chat', token, content: text }));
}