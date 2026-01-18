#!/usr/bin/env node

/**
 * Generate password hash for authentication
 * Usage: node frontend/scripts/generate-password-hash.js "your-password"
 */

const crypto = require('crypto');

const password = process.argv[2];

if (!password) {
  console.error('Error: Please provide a password');
  console.log('Usage: node scripts/generate-password-hash.js "your-password"');
  process.exit(1);
}

const hash = crypto.createHash('sha256').update(password).digest('hex');

console.log('\n✅ Password hash generated!\n');
console.log('Add this to your environment variables:\n');
console.log('LOCAL (.env.local):');
console.log(`NEXT_PUBLIC_PASSWORD_HASH=${hash}\n`);
console.log('VERCEL:');
console.log('Dashboard → Project → Settings → Environment Variables');
console.log(`Name: NEXT_PUBLIC_PASSWORD_HASH`);
console.log(`Value: ${hash}\n`);
