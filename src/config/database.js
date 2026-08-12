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

const parsed = parseDatabaseUrl(process.env.MYSQL_URL);

const pool = mysql.createPool({
  host: (parsed && parsed.host) || process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: (parsed && parsed.port) || parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306,
  user: (parsed && parsed.user) || process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: (parsed && parsed.password) || process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: (parsed && parsed.database) || process.env.DB_NAME || process.env.MYSQL_DATABASE || 'barber_trebol',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

module.exports = pool;
