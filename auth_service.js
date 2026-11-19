const { Pool } = require('pg');

// Configure the pool with sensible limits and timeouts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                 // maximum number of clients in the pool
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection not established
});

async function loginUser(userId) {
  try {
    // Use pool.query which automatically handles client acquisition and release
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0];
  } catch (err) {
    // Log the error for debugging (in production, use a proper logging library)
    console.error('Error in loginUser:', err);
    throw err; // re‑throw to let the caller handle the error
  }
}

module.exports = { loginUser };