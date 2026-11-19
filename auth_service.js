const { Pool } = require('pg');

// Configure the pool with sensible limits and timeouts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // maximum number of clients in the pool (positive integer)
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection not established
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

/**
 * Controlled, typed error so callers can branch on `code` instead of
 * string-matching messages or catching arbitrary driver errors.
 */
class LoginError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'LoginError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    Error.captureStackTrace?.(this, LoginError);
  }
}

const LOGIN_ERROR_CODES = Object.freeze({
  INVALID_USER_ID: 'INVALID_USER_ID',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  DATABASE_ERROR: 'DATABASE_ERROR',
});

/**
 * A userId is usable only if it is a non-empty string or a finite number.
 * Guards against null, undefined, '', '   ', NaN, booleans, objects, arrays.
 */
function isValidUserId(userId) {
  if (typeof userId === 'number') {
    return Number.isFinite(userId);
  }
  if (typeof userId === 'string') {
    return userId.trim().length > 0;
  }
  return false;
}

/**
 * Normalises the userId for the query. Numeric ids are compared as numbers,
 * everything else is trimmed before being passed to the driver.
 */
function normalizeUserId(userId) {
  return typeof userId === 'string' ? userId.trim() : userId;
}

/**
 * Fetches a user by id.
 *
 * Validation happens before any client is acquired from the pool, so an
 * invalid id can never reach the database or produce an unhandled rejection.
 *
 * @param {string|number} userId
 * @returns {Promise<object|null>} the user row, or null when no user matches
 * @throws {LoginError} INVALID_USER_ID when userId is null/undefined/empty
 * @throws {LoginError} DATABASE_ERROR when the query itself fails
 */
async function loginUser(userId) {
  if (!isValidUserId(userId)) {
    // Fail fast with a controlled error instead of querying with a null id.
    throw new LoginError(
      LOGIN_ERROR_CODES.INVALID_USER_ID,
      `loginUser requires a non-empty userId, received: ${describeValue(userId)}`
    );
  }

  const normalizedUserId = normalizeUserId(userId);

  try {
    // pool.query automatically handles client acquisition and release
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [normalizedUserId]);
    return result.rows[0] ?? null;
  } catch (err) {
    // Log with context, then wrap so callers get a predictable error shape.
    console.error('Error in loginUser:', {
      userId: normalizedUserId,
      code: err.code,
      message: err.message,
    });

    throw new LoginError(
      LOGIN_ERROR_CODES.DATABASE_ERROR,
      'Failed to load user due to a database error',
      { cause: err }
    );
  }
}

/**
 * Non-throwing variant for call sites that cannot handle a rejected promise
 * (fire-and-forget handlers, event listeners, scripts). Always resolves.
 *
 * @param {string|number} userId
 * @returns {Promise<{ok: boolean, user?: object|null, error?: LoginError}>}
 */
async function tryLoginUser(userId) {
  try {
    const user = await loginUser(userId);
    return { ok: true, user };
  } catch (error) {
    return { ok: false, error };
  }
}

function describeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `string of length ${value.length}`;
  return typeof value;
}

module.exports = {
  loginUser,
  tryLoginUser,
  LoginError,
  LOGIN_ERROR_CODES,
  pool,
};