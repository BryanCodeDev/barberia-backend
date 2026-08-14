const pool = require('../config/database');
const nodemailer = require('nodemailer');
const axios = require('axios');

const insertNotification = async (appointmentId, channel, recipient, status, errorMessage = null) => {
  try {
    await pool.execute(
      'INSERT INTO notifications (appointment_id, channel, recipient, status, error_message) VALUES (?, ?, ?, ?, ?)',
      [appointmentId || null, channel, recipient, status, errorMessage]
    );
  } catch (error) {
    console.error('Error inserting notification log:', error);
  }
};

const sendEmail = async ({ to, subject, html, text }) => {
  const [settingsResult] = await pool.execute('SELECT * FROM business_settings LIMIT 1');
  const settings = settingsResult[0];

  if (!settings || !settings.email) {
    console.warn('[EMAIL] No hay email configurado en business_settings');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || settings.email,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || settings.email,
      to,
      subject,
      text: text || '',
      html: html || '',
    });
    console.log(`[EMAIL] Sent to ${to}`);
    return true;
  } catch (error) {
    console.error('[EMAIL] Error sending:', error.message);
    return false;
  }
};

const sendWhatsApp = async (to, message) => {
  const [settingsResult] = await pool.execute('SELECT * FROM business_settings LIMIT 1');
  const settings = settingsResult[0];

  if (!settings || !settings.whatsapp_number) {
    console.warn('[WHATSAPP] No hay whatsapp_number configurado en business_settings');
    return false;
  }

  const apiKey = process.env.WHATSAPP_API_KEY;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (!apiKey || !phoneNumberId) {
    console.warn('[WHATSAPP] Faltan variables de entorno: WHATSAPP_API_KEY o WHATSAPP_PHONE_NUMBER_ID');
    return false;
  }

  const recipient = String(to).replace(/[^0-9]/g, '');
  if (!recipient) {
    console.warn('[WHATSAPP] Recipient vacío:', to);
    return false;
  }

  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[WHATSAPP] Sent to ${recipient}`);
    return true;
  } catch (error) {
    console.error('[WHATSAPP] Error sending:', error.response?.data || error.message);
    return false;
  }
};

const getRecommendationsForService = async (serviceId) => {
  const [rows] = await pool.execute(
    'SELECT text FROM recommendations WHERE service_id = ? AND is_active = 1 ORDER BY `order` ASC',
    [serviceId]
  );
  return rows.map((r) => r.text);
};

const sendBookingConfirmation = async (appointment) => {
  const [settingsResult] = await pool.execute('SELECT * FROM business_settings LIMIT 1');
  const settings = settingsResult[0];

  if (!settings) {
    console.warn('No hay configuración de negocio, saltando notificaciones de booking');
    return;
  }

  const appointmentDate = appointment.appointment_date || '';
  const appointmentTime = appointment.appointment_time || '';
  const serviceName = appointment.service_name || 'tu servicio';
  const clientName = appointment.client_name || 'Cliente';
  const clientPhone = appointment.client_phone || '';
  const clientEmail = appointment.client_email || '';

  const recommendations = await getRecommendationsForService(appointment.service_id);
  const recommendationsText = recommendations.length > 0
    ? '\n\nRecomendaciones:\n' + recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : '';

  const whatsappMessage = `Hola ${clientName}, tu cita para "${serviceName}" el ${appointmentDate} a las ${appointmentTime} ha sido confirmada.${recommendationsText}\n\nTe esperamos en Barbería El Bronx.`;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; color: #1C1A16; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #121113; color: #F6F2EA; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">BARBERÍA EL BRONX</h1>
        <p style="margin: 8px 0 0; color: #C9A860; font-size: 12px; letter-spacing: 4px;">EL BRONX</p>
      </div>
      <div style="padding: 32px; background-color: #F6F2EA;">
        <h2 style="color: #121113; margin-bottom: 16px;">Confirmación de Cita</h2>
        <p style="color: #6B6459; line-height: 1.6;">Hola <strong>${clientName}</strong>, tu cita ha sido confirmada.</p>
        <div style="background-color: #FFFFFF; border: 1px solid #E4DCC9; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px;"><strong>Servicio:</strong> ${serviceName}</p>
          <p style="margin: 0 0 8px;"><strong>Fecha:</strong> ${appointmentDate}</p>
          <p style="margin: 0 0 8px;"><strong>Hora:</strong> ${appointmentTime}</p>
        </div>
        ${recommendations.length > 0 ? `
        <div style="background-color: #121113; color: #F6F2EA; padding: 20px; border-radius: 8px; margin-top: 20px;">
          <h3 style="margin: 0 0 12px; color: #C9A860; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Recomendaciones</h3>
          <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
            ${recommendations.map((r) => `<li>${r}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
        <p style="color: #6B6459; margin-top: 24px; font-size: 14px;">Te esperamos en Barbería El Bronx.</p>
      </div>
      <div style="background-color: #121113; color: #6E6A61; padding: 16px; text-align: center; font-size: 12px;">
        Barbería de autor por <a href="https://mastercodecompany.com/" style="color: #C9A860; text-decoration: none;">Mastercode Company</a>
      </div>
    </div>
  `;

  const whatsappOk = clientPhone ? await sendWhatsApp(clientPhone, whatsappMessage) : false;
  const emailOk = clientEmail ? await sendEmail({ to: clientEmail, subject: 'Confirmación de cita - Barbería El Bronx', html: emailHtml, text: whatsappMessage }) : false;

  if (appointment.id) {
    await insertNotification(appointment.id, 'whatsapp', clientPhone, whatsappOk ? 'sent' : 'failed', whatsappOk ? null : 'WhatsApp send failed');
    if (clientEmail) {
      await insertNotification(appointment.id, 'email', clientEmail, emailOk ? 'sent' : 'failed', emailOk ? null : 'Email send failed');
    }
  }
};

const sendReminder = async (appointment) => {
  const message = `Recordatorio: tienes una cita mañana (${appointment.appointment_date}) a las ${appointment.appointment_time} para "${appointment.service_name}". Por favor llega 5 minutos antes.`;

  const whatsappOk = appointment.client_phone ? await sendWhatsApp(appointment.client_phone, message) : false;
  if (appointment.id) {
    await insertNotification(appointment.id, 'whatsapp', appointment.client_phone, whatsappOk ? 'sent' : 'failed', whatsappOk ? null : 'WhatsApp send failed');
  }
};

const sendOtpCode = async (phone, code) => {
  const message = `[Barbería El Bronx] Tu código de verificación es: ${code}. Código válido por 5 minutos.`;
  const whatsappOk = await sendWhatsApp(phone, message);
  await insertNotification(null, 'whatsapp', phone, whatsappOk ? 'sent' : 'failed', whatsappOk ? null : 'WhatsApp send failed');
  return whatsappOk;
};

const sendRealtimeNotification = async ({ userId, userRole, type, title, message }) => {
  try {
    await pool.execute(
      'INSERT INTO realtime_notifications (user_id, user_role, type, title, message) VALUES (?, ?, ?, ?, ?)',
      [userId, userRole, type, title, message]
    );
    return true;
  } catch (error) {
    console.error('Error inserting realtime notification:', error);
    return false;
  }
};

module.exports = {
  sendBookingConfirmation,
  sendReminder,
  sendOtpCode,
  sendRealtimeNotification,
  getRecommendationsForService,
};
