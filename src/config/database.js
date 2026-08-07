const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306,
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'barber_trebol',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

const dbHost = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306;
const dbUser = process.env.DB_USER || process.env.MYSQLUSER || 'root';
const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'barber_trebol';

logger.info(`Config DB: ${dbUser}@${dbHost}:${dbPort}/${dbName}`);

module.exports = pool;
