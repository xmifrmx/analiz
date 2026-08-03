const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Analiz Main - Entry Point ===\n');

const feedDir = path.join(__dirname, 'feed');

try {
  require('./fetch_roms.js');
} catch (error) {
  console.error('Error running scraper:', error.message);
  process.exit(1);
}
