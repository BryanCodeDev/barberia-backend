CREATE DATABASE IF NOT EXISTS barber_trebol
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE barber_trebol;

CREATE TABLE barbers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE workstations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  barber_id INT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL
);

CREATE TABLE services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category ENUM('corte','barba','cejas','combo','premium','luxury') NOT NULL,
  duration_minutes INT NOT NULL,
  price_cents INT NOT NULL,
  description TEXT NULL,
  is_popular TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NULL,
  notes TEXT NULL,
  total_visits INT DEFAULT 0,
  last_visit DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_clients_phone (phone)
);

CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  service_id INT NOT NULL,
  workstation_id INT NULL,
  barber_id INT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INT NOT NULL,
  status ENUM('pending','confirmed','completed','cancelled','no_show') DEFAULT 'pending',
  client_message TEXT NULL,
  source ENUM('web','whatsapp','phone','walk-in') DEFAULT 'web',
  reminder_sent TINYINT(1) DEFAULT 0,
  cancelled_at TIMESTAMP NULL,
  cancelled_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
  FOREIGN KEY (workstation_id) REFERENCES workstations(id) ON DELETE SET NULL,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_appointment_slot (appointment_date, appointment_time, workstation_id),
  INDEX idx_appointments_date (appointment_date),
  INDEX idx_appointments_status (status),
  INDEX idx_appointments_client (client_id)
);

CREATE TABLE business_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_name VARCHAR(200) NOT NULL,
  address TEXT NULL,
  phone VARCHAR(20) NULL,
  whatsapp_number VARCHAR(20) NULL,
  email VARCHAR(255) NULL,
  timezone VARCHAR(50) DEFAULT 'America/Bogota',
  max_advance_booking_days INT DEFAULT 30,
  min_cancel_hours INT DEFAULT 24,
  buffer_minutes_between_appointments INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  channel ENUM('whatsapp','sms','email') NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  status ENUM('sent','failed','pending') DEFAULT 'pending',
  sent_at TIMESTAMP NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

INSERT INTO business_settings (business_name, address, phone, whatsapp_number, email)
VALUES (
  'Barber Trebol',
  'CALLE 3 #4 - 77 EDIFICIO INFINITO LOCAL 01, Mosquera, Cundinamarca',
  '+57 300 123 4567',
  '573001234567',
  'contacto@barbertrebol.com'
);

INSERT INTO workstations (name, is_active) VALUES
  ('Puesto 1 - Marco Rivas', 1),
  ('Puesto 2 - Juan José Henríquez', 1);