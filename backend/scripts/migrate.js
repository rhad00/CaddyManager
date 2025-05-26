#!/usr/bin/env node
require('ts-node/register');

// Path to sequelize-cli executable
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const sequelizePath = path.resolve(__dirname, '../node_modules/.bin/sequelize-cli');

const child = spawn(sequelizePath, args, { stdio: 'inherit' });

child.on('exit', (code) => {
  process.exit(code);
});
