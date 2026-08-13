const pool = require('../config/database');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function resolveDbPath(filename) {
  const fromRoot = path.join(process.cwd(), 'database', filename);
  if (fs.existsSync(fromRoot)) {
    return fromRoot;
  }
  return path.join(__dirname, '..', 'database', filename);
}

async function migrate() {
  const connection = await pool.getConnection();
  try {
    const schemaPath = resolveDbPath('schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    const schemaStatements = schemaSQL.split(';').filter((s) => s.trim());

    for (const statement of schemaStatements) {
      if (statement.trim()) {
        try {
          await connection.query(statement);
        } catch (err) {
          const code = err.code || err.errno;
          if (code === 'ER_DUP_KEYNAME' || code === 1061 || code === 'ER_DUP_ENTRY' || code === 1062 || code === 'ER_PARSE_ERROR' || code === 1064 || code === 'ER_DUP_FIELDNAME' || code === 1060) {
            console.warn('Migration warning (duplicate index/entry/syntax/column, continuing):', err.message);
          } else {
            throw err;
          }
        }
      }
    }

    const uniqueIndexStatements = [
      'ALTER TABLE barbers ADD UNIQUE INDEX uk_barbers_name (name)',
      'ALTER TABLE workstations ADD UNIQUE INDEX uk_workstations_name (name)',
      'ALTER TABLE services ADD UNIQUE INDEX uk_services_name (name)',
      'ALTER TABLE clients ADD UNIQUE INDEX uk_clients_phone (phone)',
    ];

    for (const statement of uniqueIndexStatements) {
      try {
        await connection.query(statement);
      } catch (err) {
        const code = err.code || err.errno;
        if (code === 'ER_DUP_KEYNAME' || code === 1061) {
          console.warn('Migration warning (duplicate index, continuing):', err.message);
        } else {
          throw err;
        }
      }
    }

    const seedPath = resolveDbPath('seed.sql');
    const seedSQL = fs.readFileSync(seedPath, 'utf8');
    const seedStatements = seedSQL.split(';').filter((s) => s.trim());

    await connection.beginTransaction();
    try {
      for (const statement of seedStatements) {
        if (statement.trim()) {
          await connection.query(statement);
        }
      }
      await connection.commit();
      console.log('Seed data applied');
    } catch (seedErr) {
      await connection.rollback();
      console.error('Seed error (rolled back):', seedErr);
      throw seedErr;
    }

    console.log('Migration completed');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    connection.release();
  }
}

async function dropAndMigrate() {
  const schemaPath = resolveDbPath('schema.sql');
  const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  });

  try {
    await adminConn.query('DROP DATABASE IF EXISTS barber_trebol');
    await adminConn.query('CREATE DATABASE barber_trebol CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('Database dropped and recreated');
  } finally {
    await adminConn.end();
  }

  await migrate();
}

module.exports = { migrate, dropAndMigrate };
