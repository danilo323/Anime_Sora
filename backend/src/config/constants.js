const path = require('path');

module.exports = {
  PORT: process.env.PORT || 4000,
  VAULT_PATH: path.join(__dirname, '../data/myVault.json'),
  JIKAN_BASE_URL: 'https://api.jikan.moe/v4',
};
