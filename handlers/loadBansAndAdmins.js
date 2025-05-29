const fs = require('fs');
const path = require('path');

module.exports = () => {
  const bannedPath = path.join(__dirname, '../banned.json');
  const adminsPath = path.join(__dirname, '../admins.json');

  const bannedUsers = fs.existsSync(bannedPath)
    ? JSON.parse(fs.readFileSync(bannedPath))
    : [];

  const adminUsers = fs.existsSync(adminsPath)
    ? JSON.parse(fs.readFileSync(adminsPath))
    : [];

  return { bannedUsers, adminUsers };
};
