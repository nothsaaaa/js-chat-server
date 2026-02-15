const ws = new WebSocket('ws://localhost:3000?username=TestUser');
let token;

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'session-token') token = msg.token;
  if (msg.type === 'chat') console.log(`${msg.username}: ${msg.text}`);
};

function send(text) {
  ws.send(JSON.stringify({ type: 'chat', token, content: text }));
}