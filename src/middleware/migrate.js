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
    const schemaStatements = schemaSQL.split(';').filter((s) => s.trim());

    for (const statement of schemaStatements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    const [services] = await connection.query('SELECT COUNT(*) AS count FROM services');
    if (services[0].count === 0) {
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
        console.log('Seed data inserted');
      } catch (seedErr) {
        await connection.rollback();
        console.error('Seed error (rolled back):', seedErr);
        throw seedErr;
      }
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
