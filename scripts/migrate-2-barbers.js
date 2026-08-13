const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || parseInt(process.env.MYSQLPORT, 10) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'barber_trebol',
  });

  try {
    console.log('Iniciando migración a 2 barberos...');

    await connection.query('DELETE FROM workstations');
    console.log('Workstations antiguos eliminados.');

    await connection.query(`
      INSERT INTO barbers (name, email, phone, is_active) VALUES
        ('Marco Rivas', 'marco@barbertrebol.com', '+57 317 368 1490', 1),
        ('Juan José Henríquez', 'juanjose@barbertrebol.com', '+57 300 123 4567', 1)
      ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        phone = VALUES(phone),
        is_active = VALUES(is_active)
    `);
    console.log('Barberos creados/actualizados.');

    const [barberRows] = await connection.query('SELECT id, name FROM barbers WHERE name IN (?, ?)', ['Marco Rivas', 'Juan José Henríquez']);
    const barberMap = {};
    barberRows.forEach((row) => {
      barberMap[row.name] = row.id;
    });

    await connection.query(`
      INSERT INTO workstations (name, barber_id, is_active) VALUES
        (?, ?, 1),
        (?, ?, 1)
    `, ['Puesto 1 - Marco Rivas', barberMap['Marco Rivas'], 'Puesto 2 - Juan José Henríquez', barberMap['Juan José Henríquez']]);
    console.log('Workstations creados.');

    await connection.query('DELETE FROM services');

    await connection.query(`
      INSERT INTO services (name, category, duration_minutes, price_cents, description, is_popular) VALUES
        ('Corte Clásico', 'corte', 35, 28000, 'Corte clásico con técnica tradicional, líneas perfectas y acabado impecable.', 1),
        ('Corte Moderno', 'corte', 40, 35000, 'Corte moderno con tendencias actuales, texturas y estilo urbano.', 0),
        ('Perfilación de Barba', 'barba', 25, 18000, 'Definición precisa de la barba con máquina y navaja, líneas limpias y acabado impecable.', 1),
        ('Perfilación de Cejas', 'cejas', 10, 12000, 'Diseño y perfilado de cejas con técnica precisa para un aspecto limpio y definido.', 0),
        ('Diseño y Tribal', 'corte', 20, 15000, 'Diseños personalizados y estilo tribal con precisión y creatividad.', 0),
        ('Limpieza Facial Profunda', 'premium', 45, 40000, 'Limpieza facial profunda para renovar tu piel y mantener un aspecto saludable.', 0),
        ('Tinturas, Mechas y Colores Planos', 'premium', 75, 100000, 'Servicio de color profesional: tinturas, mechas y colores planos con productos de alta calidad.', 0),
        ('Corte Sólido Dama', 'corte', 40, 35000, 'Corte sólido para dama, clásico y elegante para resaltar tu estilo.', 0),
        ('Corte en Capas Dama', 'corte', 45, 45000, 'Corte en capas para dama, movimiento y volumen con un resultado natural.', 0),
        ('Corte Señorial Dama', 'corte', 50, 55000, 'Corte señorial para dama, sofisticado y con detalles de alta precisión.', 0),
        ('Corte Tipo Hongo Dama', 'corte', 40, 40000, 'Corte tipo hongo para dama, moderno, práctico y con estilo.', 0)
    `);
    console.log('Servicios actualizados.');

    console.log('Migración completada exitosamente.');
  } catch (error) {
    console.error('Error en la migración:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
