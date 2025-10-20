import express from 'express';
import bodyParser from 'body-parser';
import routes from '../server/routes.js';
import jwt from 'jsonwebtoken';

const app = express();
app.use(bodyParser.json());
app.use('/api', routes);

const token = jwt.sign({ id: 'admin', username: 'admin', role: 'SystemAdmin', familyId: null }, 'testsecret', { expiresIn: '60d' });

async function run() {
  const fetch = (await import('node-fetch')).default;
  // Start the app on ephemeral port
  const server = app.listen(0);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/api/packing-lists/00000000-0000-0000-0000-000000000100/items`;
  const payload = { oneOff: { name: 'Test one-off', categoryId: '00000000-0000-0000-0000-000000000000', wholeFamily: false }, memberIds: ['00000000-0000-0000-0000-000000000001'] };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log('BODY', text);
  } catch (err) {
    console.error('Fetch error', err);
  } finally {
    server.close();
  }
}

run();
