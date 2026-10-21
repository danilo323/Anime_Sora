const path = require('path');

module.exports = {
  PORT: process.env.PORT || 4000,
  VAULT_PATH: path.join(__dirname, '../data/myVault.json'),
  JIKAN_BASE_URL: 'https://api.jikan.moe/v4',
  FLV_BASE_URL: 'https://www3.animeflv.net',
  HEADERS: {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  },
};
