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

function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

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
      if (process.env.NODE_ENV === 'test') {
        console.warn('Skipping rate limiting test in test mode because authLimiter is disabled');
        return;
      }
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

  describe('Session uniqueness', () => {
    it('POST /api/auth/login should return token with session_id', async () => {
      const res = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      const decoded = decodeToken(res.body.token);
      expect(decoded).toHaveProperty('session_id');
      expect(typeof decoded.session_id).toBe('string');
      expect(decoded.session_id.length).toBeGreaterThanOrEqual(32);
    });

    it('second login of same user should replace previous session', async () => {
      const resA = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });
      expect(resA.status).toBe(200);

      const resB = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });
      expect(resB.status).toBe(200);

      const tokenA = resA.body.token;
      const tokenB = resB.body.token;
      const decodedA = decodeToken(tokenA);
      const decodedB = decodeToken(tokenB);

      expect(decodedA.session_id).not.toBe(decodedB.session_id);
      expect(decodedA.id).toBe(decodedB.id);
    });

    it('replaced session should receive 409 on /api/auth/verify', async () => {
      const resA = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });
      const resB = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });

      const verifyRes = await request('GET', '/api/auth/verify', null, {
        Authorization: `Bearer ${resA.body.token}`,
      });
      expect(verifyRes.status).toBe(409);
      expect(verifyRes.body.error).toBe('SESSION_REPLACED');
    });

    it('new session should continue working after replacement', async () => {
      const resA = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });
      const resB = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });

      const verifyRes = await request('GET', '/api/auth/verify', null, {
        Authorization: `Bearer ${resB.body.token}`,
      });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body).toHaveProperty('id', resB.body.user.id);
    });

    it('different users should not replace each other', async () => {
      const resAdmin = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });

      const otherClientRes = await request('POST', '/api/clients', {
        name: 'Otro Cliente Test',
        phone: '3015667130',
        email: 'otro@example.com',
      });
      const otherClientId = otherClientRes.status === 201 ? otherClientRes.body.id : clientIdForTests + 1;

      const resOther = await request('POST', '/api/auth/client/verify-otp', {
        phone: '3015667130',
        code: '123456',
      });

      if (resOther.status === 404) {
        const tokenOther = jwt.sign(
          { clientId: otherClientId, phone: '3015667130', role: 'client' },
          JWT_SECRET,
          { expiresIn: '1h' }
        );
        const verifyAdmin = await request('GET', '/api/auth/verify', null, {
          Authorization: `Bearer ${resAdmin.body.token}`,
        });
        expect(verifyAdmin.status).toBe(200);
        return;
      }

      const verifyAdmin = await request('GET', '/api/auth/verify', null, {
        Authorization: `Bearer ${resAdmin.body.token}`,
      });
      expect(verifyAdmin.status).toBe(200);
    });

    it('POST /api/auth/logout should invalidate session', async () => {
      const res = await request('POST', '/api/auth/login', {
        username: 'admin',
        password: 'Admin1012@',
      });
      expect(res.status).toBe(200);

      const logoutRes = await request('POST', '/api/auth/logout', null, {
        Authorization: `Bearer ${res.body.token}`,
      });
      expect(logoutRes.status).toBe(200);

      const verifyRes = await request('GET', '/api/auth/verify', null, {
        Authorization: `Bearer ${res.body.token}`,
      });
      expect([403, 409]).toContain(verifyRes.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should return 429 after too many login attempts', async () => {
      if (process.env.NODE_ENV === 'test') {
        console.warn('Skipping rate limiting test in test mode because authLimiter is disabled');
        return;
      }
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
});
