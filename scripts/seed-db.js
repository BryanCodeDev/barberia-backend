const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
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

const DB_CONFIG = {
  host: (parsed && parsed.host) || process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: (parsed && parsed.port) || parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306,
  user: (parsed && parsed.user) || process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: (parsed && parsed.password) || process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
};

function shouldSkipStatement(statement) {
  const trimmed = statement.trim().toUpperCase();
  return trimmed.startsWith('CREATE DATABASE') || trimmed.startsWith('USE ');
}

async function seedDatabase() {
  const dbName = (parsed && parsed.database) || process.env.DB_NAME || process.env.MYSQL_DATABASE || 'barber_trebol';
  const connection = await mysql.createConnection({
    ...DB_CONFIG,
    database: dbName,
  });

  try {
    const seedPath = path.join(__dirname, '..', 'database', 'seed.sql');
    const seedSQL = fs.readFileSync(seedPath, 'utf8');
    const statements = seedSQL.split(';').filter((s) => s.trim());

    await connection.beginTransaction();
    try {
      for (const statement of statements) {
        if (shouldSkipStatement(statement)) {
          continue;
        }
        await connection.query(statement);
      }
      await connection.commit();
      console.log('Database seeded successfully');
    } catch (seedErr) {
      await connection.rollback();
      console.error('Seed error (rolled back):', seedErr);
      throw seedErr;
    }
  } finally {
    await connection.end();
  }
}

seedDatabase().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
