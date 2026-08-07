INSERT INTO business_settings (business_name, address, phone, whatsapp_number, email)
VALUES (
  'Barber Trebol',
  'CALLE 3 #4 - 77 EDIFICIO INFINITO LOCAL 01, Mosquera, Cundinamarca',
  '+57 300 123 4567',
  '573001234567',
  'contacto@barbertrebol.com'
);

INSERT INTO workstations (name, is_active) VALUES
  ('Silla 1', 1),
  ('Silla 2', 1),
  ('Silla 3', 1),
  ('Silla 4', 1),
  ('Estación VIP', 1);

INSERT INTO barbers (name, email, phone) VALUES
  ('Barber Trebol', 'contacto@barbertrebol.com', '+57 300 123 4567');

INSERT INTO admin_users (username, password_hash) VALUES
  ('barbertrebol', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');

INSERT INTO services (name, category, duration_minutes, price_cents, description, is_popular) VALUES
('Corte Básico', 'corte', 35, 30000, 'Tu corte básico con el trato que mereces: profesional, preciso y con el toque VIP que nos distingue.', 1),
('Perfilación de Barba', 'barba', 25, 30000, 'Definición precisa de la barba con máquina y navaja, realzando tu estilo con líneas limpias y un acabado impecable.', 1),
('Corte y Cejas', 'combo', 40, 36000, 'Corte profesional y diseño de cejas con máxima precisión. Un servicio 5 estrellas pensado para resaltar tu imagen con estilo y detalle.', 1),
('Perfilación de Cejas', 'cejas', 10, 10000, 'Diseño y perfilado de cejas con técnica precisa para resaltar tu mirada y mantener un aspecto limpio y definido en el rostro.', 0),
('Corte y Rasurada', 'combo', 40, 40000, 'Corte a medida y rasurada clásica con navaja, para un look limpio, definido y totalmente renovado.', 0),
('Corte y Barba (Perfilada)', 'combo', 45, 50000, 'Corte personalizado y perfilado de barba con navaja. Precisión, estilo y acabado profesional en un solo servicio.', 0),
('Corte, Exfoliación y Mascarilla Puntos Negros (Nariz)', 'premium', 60, 55000, 'Corte con estilo, exfoliación facial y mascarilla removedora de puntos negros en la nariz. Un servicio completo para renovar tu imagen y cuidar tu piel.', 0),
('Corte, Exfoliación y Mascarilla Puntos Negros (Completa)', 'premium', 60, 65000, 'Servicio completo de corte con exfoliación y mascarilla removedora de puntos negros en todo el rostro para una experiencia de cuidado integral.', 0),
('Corte y Barba a Vapor (Exfoliación)', 'premium', 60, 75000, 'Corte personalizado y barba con tratamiento a vapor y exfoliación para una experiencia relajante y revitalizante.', 0),
('Corte y Barba + Exfoliación y Mascarilla Puntos Negros', 'luxury', 80, 95000, 'Corte con estilo impecable, exfoliación facial profunda y mascarilla purificante para puntos negros. Un servicio integral de alto nivel que renueva tu imagen y revitaliza tu piel.', 0),
('Corte y Barba + Exfoliación + Mascarilla Puntos Negros + Mascarilla de Colágeno', 'luxury', 90, 120000, 'Una experiencia de alto nivel: corte y barba con acabado impecable, exfoliación facial revitalizante, mascarilla removedora de impurezas y tratamiento con mascarilla de colágeno. Un ritual de cuidado masculino que eleva tu imagen y renueva tu piel con distinción.', 0);
