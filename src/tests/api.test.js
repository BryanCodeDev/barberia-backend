const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-strong-secret-key';

const request = (method, path, body = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseData) });
        } catch {
          resolve({ status: res.statusCode, body: responseData });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
};

const adminToken = jwt.sign(
  { id: 1, username: 'admin', role: 'admin', entity_id: null },
  JWT_SECRET,
  { expiresIn: '1h' }
);

let clientIdForTests = 1;
let clientToken = '';

beforeAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const createRes = await request('POST', '/api/clients', {
    name: 'Cliente Test',
    phone: '3015667129',
    email: 'test@example.com',
  });
  if (createRes.status === 201 || createRes.status === 409) {
    clientIdForTests = createRes.body?.id || clientIdForTests;
  }
  clientToken = jwt.sign(
    { clientId: clientIdForTests, phone: '3015667129', role: 'client' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
});

const barberToken = jwt.sign(
  { id: 2, username: 'marco.rivas', role: 'barber', entity_id: 1 },
  JWT_SECRET,
  { expiresIn: '1h' }
);

describe('Security Tests', () => {
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  describe('GET /api/auth/verify', () => {
    it('should return 401 without token', async () => {
      const res = await request('GET', '/api/auth/verify');
      expect(res.status).toBe(401);
    });

    it('should return 403 with invalid token', async () => {
      const res = await request('GET', '/api/auth/verify', null, {
        Authorization: 'Bearer invalid-token',
      });
      expect(res.status).toBe(403);
    });

    it('should return 200 with valid admin token', async () => {
      const res = await request('GET', '/api/auth/verify', null, {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('role', 'admin');
    });

    it('should return 200 with valid client token', async () => {
      const res = await request('GET', '/api/auth/verify', null, {
        Authorization: `Bearer ${clientToken}`,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('role', 'client');
      expect(res.body).toHaveProperty('id', 1);
    });
  });

  describe('Rate Limiting', () => {
    it('should return 429 after too many login attempts', async () => {
      for (let i = 0; i < 10; i++) {
        await request('POST', '/api/auth/login', {
          username: 'wrong',
          password: 'wrong',
        });
      }
      const res = await request('POST', '/api/auth/login', {
        username: 'wrong',
        password: 'wrong',
      });
      expect(res.status).toBe(429);
    }, 30000);
  });

  describe('IDOR Protection - GET /api/clients/:id', () => {
    it('should return 401 without token', async () => {
      const res = await request('GET', '/api/clients/1');
      expect(res.status).toBe(401);
    });

    it('should return 403 when client accesses another client', async () => {
      const otherClientToken = jwt.sign(
        { clientId: clientIdForTests + 1, phone: '3015667128', role: 'client' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      const res = await request('GET', `/api/clients/${clientIdForTests}`, null, {
        Authorization: `Bearer ${otherClientToken}`,
      });
      expect(res.status).toBe(403);
    });

    it('should return 200 when client accesses own profile', async () => {
      const res = await request('GET', `/api/clients/${clientIdForTests}`, null, {
        Authorization: `Bearer ${clientToken}`,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', clientIdForTests);
    });

    it('should return 200 when admin accesses any client', async () => {
      const res = await request('GET', `/api/clients/${clientIdForTests}`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', clientIdForTests);
    });
  });

  describe('Authorization - Admin Routes', () => {
    it('should return 401 for admin routes without token', async () => {
      const res = await request('GET', '/api/admin/stats');
      expect(res.status).toBe(401);
    });

    it('should return 403 when client accesses admin routes', async () => {
      const res = await request('GET', '/api/admin/stats', null, {
        Authorization: `Bearer ${clientToken}`,
      });
      expect(res.status).toBe(403);
    });

    it('should return 200 when barber accesses admin routes', async () => {
      const res = await request('GET', '/api/admin/stats', null, {
        Authorization: `Bearer ${barberToken}`,
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Appointments Authorization', () => {
    it('should return 403 when client accesses /my without client role', async () => {
      const res = await request('GET', '/api/appointments/my', null, {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(403);
    });
  });
});
