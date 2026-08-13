const http = require('http');

const postData = JSON.stringify({ name: 'Test User', phone: '3001234567' });

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/clients',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(postData);
req.end();

setTimeout(() => {
  console.log('Timeout: 5 seconds elapsed');
  process.exit(1);
}, 5000);
