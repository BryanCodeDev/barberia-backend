INSERT INTO business_settings (id, business_name, address, phone, whatsapp_number, email, timezone, max_advance_booking_days, min_cancel_hours, buffer_minutes_between_appointments)
VALUES (
  1,
  'BARBERÍA EL BRONX',
  'CALLE 3 #4 - 77 EDIFICIO INFINITO LOCAL 01, Mosquera, Cundinamarca',
  '+301 566 7129',
  '3015667129',
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

DELETE FROM barbers WHERE name IN ('Marco Rivas', 'Juan José Henríquez');

INSERT INTO barbers (name, email, phone, is_active) VALUES
  ('Marco Rivas', 'marco@barbertrebol.com', '+301 566 7129', 1),
  ('Juan José Henríquez', 'juanjose@barbertrebol.com', '+300 180 5635', 1)
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  phone = VALUES(phone),
  is_active = VALUES(is_active);

SET @marco_id = (SELECT id FROM barbers WHERE name = 'Marco Rivas' LIMIT 1);
SET @juan_id = (SELECT id FROM barbers WHERE name = 'Juan José Henríquez' LIMIT 1);

INSERT INTO workstations (name, barber_id, is_active) VALUES
  ('Puesto 1 - Marco Rivas', @marco_id, 1),
  ('Puesto 2 - Juan José Henríquez', @juan_id, 1)
ON DUPLICATE KEY UPDATE
  barber_id = VALUES(barber_id),
  is_active = VALUES(is_active);

UPDATE services SET is_active = 0;

INSERT INTO services (name, category, duration_minutes, price_cents, description, is_popular, is_active) VALUES
('Corte', 'corte', 25, 25000, 'Corte profesional con técnica moderna y acabado impecable.', 1, 1),
('Corte y Barba', 'combo', 40, 35000, 'Combo completo de corte y barba para un look perfecto.', 1, 1),
('Servicio de Barba', 'barba', 20, 15000, 'Definición y perfilado de barba con máquina y navaja.', 0, 1),
('Barba Pigmentada', 'barba', 30, 20000, 'Barba con pigmentación para un acabado más definido y duradero.', 0, 1),
('Diseño de Cejas', 'cejas', 10, 7000, 'Diseño y perfilado de cejas con técnica precisa.', 0, 1),
('Perfilado de Cejas', 'cejas', 10, 5000, 'Perfilado rápido de cejas para mantener la forma.', 0, 1),
('Promoción Corte + Barba + Cejas', 'combo', 60, 35000, 'Paquete completo: corte, barba y cejas en una sola visita.', 1, 1),
('Limpieza Facial Profunda', 'premium', 45, 45000, 'Vapor ozono, exfoliación, mascarilla negra y masaje facial.', 0, 1),
('Mascarilla Negra y Masaje', 'premium', 20, 10000, 'Mascarilla negra purificante con masaje facial relajante.', 0, 1),
('Mechas Platinado y Blanco', 'premium', 90, 180000, 'Servicio de mechas platinado y blanco con productos profesionales.', 0, 1),
('Colores Planos', 'premium', 90, 150000, 'Aplicación de color plano profesional con acabado uniforme.', 0, 1),
('Corte para Dama', 'corte', 40, 25000, 'Corte profesional para dama, adaptado a tu estilo y preferencias.', 1, 1)
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  duration_minutes = VALUES(duration_minutes),
  price_cents = VALUES(price_cents),
  description = VALUES(description),
  is_popular = VALUES(is_popular),
  is_active = VALUES(is_active);

DELETE FROM admin_users WHERE id > 0;

INSERT INTO admin_users (username, password_hash, role, entity_id, is_active) VALUES
  ('marco.rivas', '$2a$10$g1oGIZFBjuPp4CJUrMG9C.9St1YnVOK7QjfI8A5gyfF7.dpiLzAzW', 'barber', @marco_id, 1),
  ('juanjose.henriquez', '$2a$10$N2z06ewFykAxmRibg8UBBuze6yUsXagG5RVSsCdZZKTx65lOsgsyC', 'barber', @juan_id, 1),
  ('admin', '$2a$10$4vGokjIBjuc8GA6mViOyJ.39vvrBaEyzhbIfhespV6fsytl7gB4yy', 'admin', NULL, 1);

INSERT INTO recommendations (service_id, text, `order`, is_active) VALUES
  (1, 'Llegá 5 minutos antes para disfrutar la experiencia completa sin apuros.', 1, 1),
  (1, 'Después del corte, podés pedir tu lavado incluido y terminamos con toalla caliente.', 2, 1),
  (1, 'Si querés mantener el estilo, agendá tu próxima visita antes de irte.', 3, 1),
  (2, 'Para la barba, relajate y dejá que el barbero haga el perfilado completo con toalla caliente.', 1, 1),
  (2, 'Podés coordinar barba + cejas en la misma sesión para un resultado más completo.', 2, 1),
  (3, 'El diseño de cejas se recomienda cada 3 semanas para mantener la forma.', 1, 1),
  (4, 'Perfilado rápido: ideal para retoques entre diseños completos.', 1, 1),
  (7, 'El combo te queda mejor si coordinamos el corte, la barba y el diseño de cejas en un solo turno.', 1, 1),
  (7, 'Consultá por el pack de mantenimiento para repetir en 20 días y mantener el look.', 2, 1),
  (8, 'Después de la limpieza facial evitá el sol directo por 24 horas.', 1, 1),
  (8, 'Podés complementar con una mascarilla negra para resultados más duraderos.', 2, 1)
ON DUPLICATE KEY UPDATE
  text = VALUES(text),
  `order` = VALUES(`order`),
  is_active = VALUES(is_active);
