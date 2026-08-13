const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

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
    const statements = schemaSQL.split(';').filter((s) => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    const [services] = await connection.query('SELECT COUNT(*) AS count FROM services');
    if (services[0].count === 0) {
      const seedPath = resolveDbPath('seed.sql');
      const seedSQL = fs.readFileSync(seedPath, 'utf8');
      const seedStatements = seedSQL.split(';').filter((s) => s.trim());

      for (const statement of seedStatements) {
        if (statement.trim()) {
          await connection.query(statement);
        }
      }
      console.log('Seed data inserted');
    }

    console.log('Migration completed');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { migrate };
