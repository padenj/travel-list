const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../server/auth');

const role = process.argv[2] || 'SystemAdmin';
const id = process.argv[3] || '11111111-1111-1111-1111-111111111111';
const username = process.argv[4] || 'localadmin';
const familyId = process.argv[5] || null;

const token = jwt.sign({ id, username, role, familyId }, JWT_SECRET, { expiresIn: '60d' });
console.log(token);
