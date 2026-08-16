const pool = require('../config/database');
const { getDatabaseConfig, getDatabaseName, recreatePool } = require('../config/database');
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

function getAdminConfig() {
  const config = getDatabaseConfig();
  const { database, waitForConnections, connectionLimit, queueLimit, charset, connectTimeout, ...adminConfig } = config;
  return adminConfig;
}

function shouldSkipStatement(statement) {
  const trimmed = statement.trim().toUpperCase();
  return trimmed.startsWith('CREATE DATABASE') || trimmed.startsWith('USE ');
}

async function migrate() {
  const connection = await pool.getConnection();
  try {
    const schemaPath = resolveDbPath('schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    const schemaStatements = schemaSQL.split(';').filter((s) => s.trim());

    for (const statement of schemaStatements) {
      if (!statement.trim() || shouldSkipStatement(statement)) {
        continue;
      }
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

    await connection.query('ALTER TABLE sessions DROP INDEX uk_user_active_session');

    const seedPath = resolveDbPath('seed.sql');
    const seedSQL = fs.readFileSync(seedPath, 'utf8');
    const seedStatements = seedSQL.split(';').filter((s) => s.trim());

    await connection.beginTransaction();
    try {
      for (const statement of seedStatements) {
        if (!statement.trim() || shouldSkipStatement(statement)) {
          continue;
        }
        await connection.query(statement);
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
  const dbName = getDatabaseName();
  const adminConfig = getAdminConfig();
  const adminConn = await mysql.createConnection(adminConfig);

  try {
    await adminConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await adminConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Database ${dbName} dropped and recreated`);
  } finally {
    await adminConn.end();
  }

  await recreatePool();
  await migrate();
}

module.exports = { migrate, dropAndMigrate };
