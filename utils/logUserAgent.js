const fs = require('fs');
const path = require('path');

const logFile = path.resolve(__dirname, '../useragents.json');

function logUserAgent(ip, userAgent) {
  const timestamp = new Date().toISOString();
  const entry = { ip, userAgent, timestamp };

  let existing = [];

  try {
    if (fs.existsSync(logFile)) {
      const data = fs.readFileSync(logFile, 'utf-8');
      existing = JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to read useragents.json:', err);
  }

  existing.push(entry);

  try {
    fs.writeFileSync(logFile, JSON.stringify(existing, null, 2));
  } catch (err) {
    console.error('Failed to write useragents.json:', err);
  }
}

module.exports = logUserAgent;
