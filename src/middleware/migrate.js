const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
  try {
    const connection = await pool.getConnection();
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.clean.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    const statements = schemaSQL.split(';').filter((s) => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    const [services] = await connection.query('SELECT COUNT(*) AS count FROM services');
    if (services[0].count === 0) {
      const seedPath = path.join(__dirname, '..', 'database', 'seed.clean.sql');
      const seedSQL = fs.readFileSync(seedPath, 'utf8');
      const seedStatements = seedSQL.split(';').filter((s) => s.trim());

      for (const statement of seedStatements) {
        if (statement.trim()) {
          await connection.query(statement);
        }
      }
      console.log('Seed data inserted');
    }

    connection.release();
    console.log('Migration completed');
  } catch (err) {
    console.error('Migration error:', err);
  }
}

module.exports = { migrate };
