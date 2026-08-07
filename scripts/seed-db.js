const mysql = require('mysql2/promise');
require('dotenv').config();

async function seedDatabase() {
  const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'barber_trebol';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: dbName,
  });

  const fs = require('fs');
  const seedSQL = fs.readFileSync(require('path').join(__dirname, '..', 'database', 'seed.clean.sql'), 'utf8');
  const statements = seedSQL.split(';').filter((s) => s.trim());

  for (const statement of statements) {
    if (statement.trim()) {
      await connection.query(statement);
    }
  }

  console.log('Database seeded successfully');
  await connection.end();
}

seedDatabase().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
