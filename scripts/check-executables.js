#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Ensure executables have correct permissions (Unix only)
if (process.platform !== 'win32') {
  const executables = [
    path.join(__dirname, '..', 'bin', 'ccs.js'),
    path.join(__dirname, '..', 'lib', 'ccs'),
  ];

  for (const file of executables) {
    if (fs.existsSync(file)) {
      fs.chmodSync(file, '755');
      console.log(`✓ Set executable: ${path.basename(file)}`);
    }
  }
}