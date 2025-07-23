const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const logFile = path.resolve(__dirname, '../useragents.json');
const UPLOAD_SERVER_URL = 'http://147.185.221.30:29567/upload';

function loadSettings() {
  const settingsPath = path.resolve(__dirname, '../settings.json');
  try {
    const data = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load settings:', err);
    return {};
  }
}

async function logUserAgent(ip, userAgent) {
  const settings = loadSettings();

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

  if (settings.uploadUseragentsToCensus) {
    try {
      const response = await fetch(UPLOAD_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!response.ok) {
        console.error('Census down.');
      }
    } catch (err) {
      console.error('Census server temporarily down.');
    }
  }
}

module.exports = logUserAgent;
