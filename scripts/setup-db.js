const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
  const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'barber_trebol';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${dbName}\``);

  const fs = require('fs');
  const schemaPath = require('path').join(__dirname, '..', 'database', 'schema.sql');
  const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
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
