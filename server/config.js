const path = require('path');

const config = {
  PORT: process.env.PORT || 3000,
  STATIC_PATH: path.resolve(__dirname, '..', 'dist', 'public'),
  DEFAULT_MAP_ID: 'map1',
  BINARY_MESSAGE_MOUSE_MOVE: 1,
  MAX_CHAT_MESSAGE_LENGTH: 256
};

module.exports = config; 