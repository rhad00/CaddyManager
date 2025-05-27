#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

// Debug logging
console.log('Working directory:', process.cwd());

const args = process.argv.slice(2);
const sequelizePath = path.resolve(__dirname, '../node_modules/.bin/sequelize-cli');

console.log('Executing:', sequelizePath, args.join(' '));

// Add seeders path
const seedersPath = path.resolve(__dirname, '..', 'src', 'seeders');
const finalArgs = args.includes('--seeders-path') ? args : ['--seeders-path', seedersPath, ...args];

console.log('Final command:', sequelizePath, finalArgs.join(' '));

// Run sequelize-cli without trying to load TypeScript models
const child = spawn(sequelizePath, finalArgs, {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    // Tell Sequelize CLI to use the JS config file
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
});

child.on('exit', (code) => {
  process.exit(code);
});
