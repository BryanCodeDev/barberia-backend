const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

const BASE = 'http://localhost:3001/api';

async function req(method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost', port: 3001, path: url, method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
      timeout: 8000,
    };
    const r = http.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')); });
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });

  // Limpieza
  await conn.execute("DELETE FROM clients WHERE phone = '3101234567'");
  await conn.execute("DELETE FROM otp_codes WHERE phone = '3101234567'");

  // 1. Create test client (needed for verify-otp)
  console.log('--- Creating test client ---');
  const r1 = await req('POST', '/api/clients', { name: 'Test User', phone: '3101234567' });
  console.log(JSON.stringify(r1));

  // 2. Request OTP (first time - should succeed)
  console.log('--- Requesting OTP (1st) ---');
  const r2 = await req('POST', '/api/auth/client/request-otp', { phone: '3101234567' });
  console.log(JSON.stringify(r2));

  // 3. Request OTP again (should be rate limited)
  console.log('--- Requesting OTP (2nd - should be 429) ---');
  const r3 = await req('POST', '/api/auth/client/request-otp', { phone: '3101234567' });
  console.log(JSON.stringify(r3));

  // 4. Get the actual OTP code from DB
  const [rows] = await conn.execute('SELECT code FROM otp_codes WHERE phone = ? AND used = 0 ORDER BY created_at DESC LIMIT 1', ['3101234567']);
  const otpCode = rows[0].code;
  console.log('--- OTP code from DB:', otpCode, '---');

  // 5. Verify OTP (correct code)
  console.log('--- Verifying OTP (correct) ---');
  const r4 = await req('POST', '/api/auth/client/verify-otp', { phone: '3101234567', code: otpCode });
  console.log(JSON.stringify(r4));

  // 6. Fetch client with appointments
  console.log('--- Fetching client with appointments ---');
  const clientId = r4.body.id;
  const r5 = await req('GET', `/api/clients/${clientId}`);
  console.log('has appointments:', Array.isArray(r5.body.appointments), 'count:', r5.body.appointments?.length || 0);

  // 7. Verify OTP again (code already used - should fail)
  console.log('--- Verifying OTP again (already used) ---');
  const r6 = await req('POST', '/api/auth/client/verify-otp', { phone: '3101234567', code: otpCode });
  console.log(JSON.stringify(r6));

  // 8. Request a new OTP
  console.log('--- Requesting new OTP ---');
  await new Promise(r => setTimeout(r, 1000));
  const r7 = await req('POST', '/api/auth/client/request-otp', { phone: '3101234567' });
  console.log(JSON.stringify(r7));

  // 9. Verify with wrong code 5 times (should hit attempt limit)
  const [rows2] = await conn.execute('SELECT code FROM otp_codes WHERE phone = ? AND used = 0 ORDER BY created_at DESC LIMIT 1', ['3101234567']);
  const newOtp = rows2[0].code;
  console.log('--- Testing wrong attempts ---');
  for (let i = 1; i <= 5; i++) {
    const r = await req('POST', '/api/auth/client/verify-otp', { phone: '3101234567', code: '999999' });
    console.log(`Attempt ${i}:`, r.status, JSON.stringify(r.body));
  }

  // 10. Verify with correct code after 5 wrong attempts (should be locked)
  console.log('--- Verifying after 5 failed attempts (should be 429) ---');
  const r8 = await req('POST', '/api/auth/client/verify-otp', { phone: '3101234567', code: newOtp });
  console.log(JSON.stringify(r8));

  await conn.end();
  console.log('\n=== ALL TESTS COMPLETED ===');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
