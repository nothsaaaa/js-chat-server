const fs = require('fs');
const path = require('path');

module.exports = () => {
  const settingsPath = path.join(__dirname, '../settings.json');
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath));
  }
  return { authentication: false };
};
