/**
 * Seed script — generates data/users.json with bcrypt-hashed passwords.
 *
 * Usage:  npm run seed
 *
 * To add future users, append entries to the `users` array below and re-run.
 * Each entry needs: username, plaintext password (hashed automatically), displayName.
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const SALT_ROUNDS = 12;

// --- Add authorized faculty users here ---
const users = [
  { username: 'Anu', password: 'CCCAI', displayName: 'Anu' }
  // { username: 'NewUser', password: 'SecurePass123', displayName: 'New User' }
];

async function seed() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const hashed = [];
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    hashed.push({
      username: u.username,
      passwordHash,
      displayName: u.displayName
    });
    console.log(`Hashed password for user: ${u.username}`);
  }

  const outPath = path.join(dataDir, 'users.json');
  fs.writeFileSync(outPath, JSON.stringify(hashed, null, 2), 'utf-8');
  console.log(`\nUser store written to ${outPath}`);
  console.log(`Total users: ${hashed.length}`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
