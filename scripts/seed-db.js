const mysql = require('mysql2/promise');
require('dotenv').config();

async function seedDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'barberia_camilo',
  });

  const fs = require('fs');
  const seedSQL = fs.readFileSync(require('path').join(__dirname, '..', 'database', 'seed.sql'), 'utf8');
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