USE barber_trebol;

INSERT INTO business_settings (id, business_name, address, phone, whatsapp_number, email, timezone, max_advance_booking_days, min_cancel_hours, buffer_minutes_between_appointments)
VALUES (
  1,
  'Barber Trebol',
  'CALLE 3 #4 - 77 EDIFICIO INFINITO LOCAL 01, Mosquera, Cundinamarca',
  '+57 317 368 1490',
  '573113670631',
  'mastercodecompany@gmail.com',
  'America/Bogota',
  30,
  24,
  0
)
ON DUPLICATE KEY UPDATE
  business_name = VALUES(business_name),
  address = VALUES(address),
  phone = VALUES(phone),
  whatsapp_number = VALUES(whatsapp_number),
  email = VALUES(email),
  timezone = VALUES(timezone),
  max_advance_booking_days = VALUES(max_advance_booking_days),
  min_cancel_hours = VALUES(min_cancel_hours),
  buffer_minutes_between_appointments = VALUES(buffer_minutes_between_appointments);

INSERT INTO barbers (name, email, phone, is_active) VALUES
  ('Marco Rivas', 'marco@barbertrebol.com', '+57 317 368 1490', 1),
  ('Juan José Henríquez', 'juanjose@barbertrebol.com', '+57 300 123 4567', 1)
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  phone = VALUES(phone),
  is_active = VALUES(is_active);

SET @marco_id = (SELECT id FROM barbers WHERE name = 'Marco Rivas');
SET @juan_id = (SELECT id FROM barbers WHERE name = 'Juan José Henríquez');

INSERT INTO workstations (name, barber_id, is_active) VALUES
  ('Puesto 1 - Marco Rivas', @marco_id, 1),
  ('Puesto 2 - Juan José Henríquez', @juan_id, 1)
ON DUPLICATE KEY UPDATE
  barber_id = VALUES(barber_id),
  is_active = VALUES(is_active);

INSERT INTO services (name, category, duration_minutes, price_cents, description, is_popular, is_active) VALUES
('Corte Clásico', 'corte', 35, 28000, 'Corte clásico con técnica tradicional, líneas perfectas y acabado impecable.', 1, 1),
('Corte Moderno', 'corte', 40, 35000, 'Corte moderno con tendencias actuales, texturas y estilo urbano.', 0, 1),
('Perfilación de Barba', 'barba', 25, 18000, 'Definición precisa de la barba con máquina y navaja, líneas limpias y acabado impecable.', 1, 1),
('Perfilación de Cejas', 'cejas', 10, 12000, 'Diseño y perfilado de cejas con técnica precisa para un aspecto limpio y definido.', 0, 1),
('Diseño y Tribal', 'corte', 20, 15000, 'Diseños personalizados y estilo tribal con precisión y creatividad.', 0, 1),
('Limpieza Facial Profunda', 'premium', 45, 40000, 'Limpieza facial profunda para renovar tu piel y mantener un aspecto saludable.', 0, 1),
('Tinturas, Mechas y Colores Planos', 'premium', 75, 100000, 'Servicio de color profesional: tinturas, mechas y colores planos con productos de alta calidad.', 0, 1),
('Corte Sólido Dama', 'corte', 40, 35000, 'Corte sólido para dama, clásico y elegante para resaltar tu estilo.', 0, 1),
('Corte en Capas Dama', 'corte', 45, 45000, 'Corte en capas para dama, movimiento y volumen con un resultado natural.', 0, 1),
('Corte Señorial Dama', 'corte', 50, 55000, 'Corte señorial para dama, sofisticado y con detalles de alta precisión.', 0, 1),
('Corte Tipo Hongo Dama', 'corte', 40, 40000, 'Corte tipo hongo para dama, moderno, práctico y con estilo.', 0, 1)
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  duration_minutes = VALUES(duration_minutes),
  price_cents = VALUES(price_cents),
  description = VALUES(description),
  is_popular = VALUES(is_popular),
  is_active = VALUES(is_active);

DELETE FROM admin_users;

INSERT INTO admin_users (username, password_hash, is_active) VALUES
  ('marco.rivas', '$2a$10$vZkIKaNd/iq/K87BK9CfqON59Y2T2u1PRyi6Vz/gX9ggOPun4cQNe', 1),
  ('juanjose.henriquez', '$2a$10$vZkIKaNd/iq/K87BK9CfqON59Y2T2u1PRyi6Vz/gX9ggOPun4cQNe', 1),
  ('admin', '$2a$10$xpMJeJ3z9UW2T2Q7CApntuL5nGOwMo5MKfBwRM.SYVybEYOO96YVi', 1);
