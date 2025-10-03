// In-memory mock DB for initial implementation
import sqlite3 from 'sqlite3';
import { User, Family } from './server-types';

export const users: User[] = [];
export const families: Family[] = [];

export function findUserByUsername(username: string): User | undefined {
  return users.find(u => u.username === username);
}

export function addUser(user: User): User {
  users.push(user);
  return user;
}

export function updateUser(id: string, updates: Partial<User>): User | undefined {
  const user = users.find(u => u.id === id);
  if (user) Object.assign(user, updates);
  return user;
}

export function addFamily(family: Family): Family {
  families.push(family);
  return family;
}

export function findFamilyById(id: string): Family | undefined {
  return families.find(f => f.id === id);
}
