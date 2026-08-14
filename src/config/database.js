const mysql = require('mysql2/promise');
require('dotenv').config();

function parseDatabaseUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const dbName = u.pathname.replace(/^\//, '');
    return {
      host: u.hostname,
      port: parseInt(u.port || '3306', 10),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: dbName || 'barber_trebol',
    };
  } catch (err) {
    return null;
  }
}

function getDatabaseConfig() {
  const parsed = parseDatabaseUrl(process.env.MYSQL_URL);
  return {
    host: (parsed && parsed.host) || process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
    port: (parsed && parsed.port) || parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306,
    user: (parsed && parsed.user) || process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: (parsed && parsed.password) || process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: (parsed && parsed.database) || process.env.DB_NAME || process.env.MYSQL_DATABASE || 'barber_trebol',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 50,
    charset: 'utf8mb4',
    connectTimeout: 10000,
  };
}

function getDatabaseName() {
  return getDatabaseConfig().database;
}

let poolInstance = mysql.createPool(getDatabaseConfig());

function attachPoolHandlers(p) {
  p.on('connection', () => {
    console.log('[DB] pool connection acquired');
  });
  p.on('release', () => {
    console.log('[DB] pool connection released');
  });
  p.on('error', (err) => {
    console.error('[DB] pool error:', err);
  });
}

attachPoolHandlers(poolInstance);

const pool = new Proxy({
  parseDatabaseUrl,
  getDatabaseConfig,
  getDatabaseName,
  async end() {
    await poolInstance.end();
  },
}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return poolInstance[prop];
  },
});

async function recreatePool() {
  await poolInstance.end();
  poolInstance = mysql.createPool(getDatabaseConfig());
  attachPoolHandlers(poolInstance);
  console.log('[DB] pool recreated');
}

module.exports = pool;
module.exports.recreatePool = recreatePool;
