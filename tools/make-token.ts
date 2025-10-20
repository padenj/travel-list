import { generateToken } from '../server/auth';
import { v4 as uuidv4 } from 'uuid';

const role = process.argv[2] || 'SystemAdmin';
const id = process.argv[3] || uuidv4();
const username = process.argv[4] || `local_${Date.now()}`;
const familyId = process.argv[5] || null;

const token = generateToken({ id, username, role, familyId });
console.log(token);
