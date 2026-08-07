const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'barberia_camilo'}\``);
  await connection.query(`USE \`${process.env.DB_NAME || 'barberia_camilo'}\``);

  const fs = require('fs');
  const schemaSQL = fs.readFileSync(require('path').join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const statements = schemaSQL.split(';').filter((s) => s.trim());

  for (const statement of statements) {
    if (statement.trim()) {
      await connection.query(statement);
    }
  }

  console.log('Database schema created successfully');
  await connection.end();
}

setupDatabase().catch((err) => {
  console.error('Error setting up database:', err);
  process.exit(1);
});