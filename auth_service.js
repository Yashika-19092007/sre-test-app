const { Pool } = require('pg');

// Bug: Koi connection limit ya timeout set nahi hai
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function loginUser(userId) {
  const client = await pool.connect();
  const res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
  // Bug: client.release() nahi kiya, isse memory leak aur DB timeout hoga
  return res.rows[0];
}

module.exports = { loginUser };
