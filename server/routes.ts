// ...existing code...
import express, { Request, Response, Router } from 'express';
import { logAudit } from './audit';
import { validatePassword, hashPassword, comparePassword, hashPasswordSync, comparePasswordSync, generateToken } from './auth';
import { authMiddleware } from './middleware';
import { UserRepository, FamilyRepository } from './repositories';
import { ERROR_CODES, USER_ROLES, HTTP_STATUS } from './constants';
import { User, LoginRequest, ChangePasswordRequest } from './server-types';
import { v4 as uuidv4 } from 'uuid';

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const router: Router = express.Router();

const userRepo = new UserRepository();
const familyRepo = new FamilyRepository();

// Create default admin if not exists
export async function ensureDefaultAdmin() {
  const admin = await userRepo.findByUsername('administrator');
  if (!admin) {
    try {
      await userRepo.create({
        id: uuidv4(),
        username: 'administrator',
        password: hashPasswordSync('adminChangeMe1!'),
        role: 'SystemAdmin',
        must_change_password: true,
        email: '',
        familyId: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (err: any) {
      // Ignore duplicate admin creation error
      if (err.code !== 'SQLITE_CONSTRAINT') throw err;
    }
  }
}
ensureDefaultAdmin();

// Login endpoint
router.post('/login', async (req: Request, res: Response): Promise<Response> => {
  const { username, password } = req.body;
  const user = await userRepo.findByUsername(username);
  if (!user || !user.password_hash || !comparePasswordSync(password, user.password_hash)) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_CODES.INVALID_CREDENTIALS 
    });
  }
  if (user.must_change_password) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({ 
      error: ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
      username: user.username || ''
    });
  }
  const token = generateToken(user);
  await logAudit({
    userId: user.id,
    username: user.username || '',
    action: 'login',
    details: 'User logged in successfully'
  });
  return res.json({ token, role: user.role });
});

// Logout endpoint (client-side: just delete token)
router.post('/logout', (req: Request, res: Response): Response => {
  return res.json({ message: 'Logged out' });
});

// Change password endpoint
router.post('/change-password', async (req: Request, res: Response): Promise<Response> => {
  const { username, oldPassword, newPassword } = req.body;
  const user = await userRepo.findByUsername(username);
  if (!user || !user.password_hash || !comparePasswordSync(oldPassword, user.password_hash)) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_CODES.INVALID_CREDENTIALS 
    });
  }
  if (!validatePassword(newPassword)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      error: ERROR_CODES.PASSWORD_TOO_WEAK 
    });
  }
  await userRepo.update(user.id, {
    password_hash: await hashPassword(newPassword),
    must_change_password: false
  });
  await logAudit({
    userId: user.id,
    username: user.username || '',
    action: 'change-password',
    details: 'User changed password'
  });
  return res.json({ message: 'Password changed successfully' });
});

// Create family member (SystemAdmin only)
router.post('/families/:familyId/members', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { familyId } = req.params;
  const { name, canLogin, username, password, role } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Member name is required' });
  }
  
  // Validate family exists
  const family = await familyRepo.findById(familyId);
  if (!family) {
    return res.status(404).json({ error: 'Family not found' });
  }
  
  // If canLogin is true, validate username and password
  if (canLogin) {
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required for login-enabled members' });
    }
    if (!password || !validatePassword(password)) {
      return res.status(400).json({ error: 'Password does not meet requirements' });
    }
    
    // Check if username already exists
    const existingUser = await userRepo.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
  }
  
  try {
    const memberData: any = {
      id: uuidv4(),
      name: name.trim(),
      familyId,
      role: canLogin ? (role || 'FamilyMember') : 'FamilyMember',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    if (canLogin && username && password) {
      memberData.username = username.trim();
      memberData.password_hash = await hashPassword(password);
      memberData.must_change_password = false;
    }
    
    const newMember = await userRepo.create(memberData);
    
    return res.json({ member: newMember });
  } catch (error) {
    console.error('Error creating family member:', error);
    return res.status(500).json({ error: 'Failed to create family member' });
  }
});

// Edit family member (SystemAdmin only)
router.put('/families/:familyId/members/:memberId', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { familyId, memberId } = req.params;
  const { name, username, role } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Member name is required' });
  }
  try {
    const updated = await userRepo.update(memberId, {
      name: name.trim(),
      username: username || null,
      role: role || 'FamilyMember',
      updated_at: new Date().toISOString(),
    });
    return res.json({ member: updated });
  } catch (error) {
    console.error('Error updating family member:', error);
    return res.status(500).json({ error: 'Failed to update family member' });
  }
});

// Reset password for family member (SystemAdmin only)
router.post('/families/:familyId/members/:memberId/reset-password', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { memberId } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || !validatePassword(newPassword)) {
    return res.status(400).json({ error: 'Password does not meet requirements' });
  }
  try {
    const newHash = await hashPassword(newPassword);
    const updated = await userRepo.update(memberId, {
      password_hash: newHash,
      must_change_password: true,
      updated_at: new Date().toISOString(),
    });
    return res.json({ member: updated });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Password reset endpoint (admin or user recovery)
router.post('/reset-password', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  const { username, newPassword } = req.body;
  // Only SystemAdmin or FamilyAdmin can reset passwords for other users
  // If not authenticated as admin, only allow self-reset (e.g., via recovery flow)
  // For now, assume admin-only for simplicity
  if (!req.user || (req.user.role !== 'SystemAdmin' && req.user.role !== 'FamilyAdmin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const user = await userRepo.findByUsername(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!validatePassword(newPassword)) {
    return res.status(400).json({ error: 'Password does not meet policy' });
  }
  await userRepo.update(user.id, {
    password_hash: await hashPassword(newPassword),
    must_change_password: false
  });
  await logAudit({
    userId: user.id,
    username: user.username || '',
    action: 'reset-password',
    details: `Password reset by ${req.user?.username || ''}`
  });
  return res.json({ message: 'Password reset successfully' });
});

// Get all users (SystemAdmin only)
router.get('/users', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const users = await userRepo.findAll();
  return res.json({ users });
});

// Get current user profile
router.get('/users/me', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  try {
    const user = await userRepo.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get family information and members if user is assigned to one
    let family = null;
    let members = [];
    if (user.familyId) {
      family = await familyRepo.findById(user.familyId);
      if (family) {
        // Get all users in this family
        members = await userRepo.findAll();
        members = members.filter(u => u.familyId === user.familyId && !u.deleted_at);
        // Remove sensitive info from each member
        members = members.map(({ password_hash, ...rest }) => rest);
        family = { ...family, members };
      }
    }
    // Remove sensitive information from response
    const { password_hash, ...safeUser } = user;
    return res.json({ 
      user: safeUser,
      family: family 
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    return res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Add user (SystemAdmin only)
router.post('/users', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  const { username, password, role, email, familyId } = req.body;
  // Only SystemAdmin can add SystemAdmin users
  if (role === 'SystemAdmin' && req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password does not meet policy' });
  }
  const existing = await userRepo.findByUsername(username);
  if (existing) {
    return res.status(409).json({ error: 'User already exists' });
  }
  const user = await userRepo.create({
    id: uuidv4(),
    username,
    password: await hashPassword(password),
    role,
    must_change_password: false,
    email,
    familyId: familyId || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  return res.json({ user });
});

// Delete user (SystemAdmin only)
router.delete('/users/:id', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  await userRepo.softDelete(id);
  return res.json({ message: 'User deleted successfully' });
});

// Get all families (SystemAdmin only)
router.get('/families', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const families = await familyRepo.findAll();
  return res.json({ families });
});

// Add family (SystemAdmin only)
router.post('/families', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Debug logging for troubleshooting request body issues
  console.log('🔎 Incoming POST /api/families');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  const { name } = req.body;

  if (!name || name.trim() === '') {
    console.log('⚠️ Family name missing or empty in request body');
    return res.status(400).json({ error: 'Family name is required' });
  }

  try {
    // Check if the current user is already assigned to a family
    const currentUser = await userRepo.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (currentUser.familyId) {
      // User is already in a family - update that family's name instead
      const existingFamily = await familyRepo.findById(currentUser.familyId);
      if (existingFamily) {
        const updatedFamily = await familyRepo.update(currentUser.familyId, {
          name: name.trim(),
          updated_at: new Date().toISOString()
        });
        console.log('✅ Family updated:', updatedFamily);
        return res.json({ family: updatedFamily, updated: true });
      }
    }

    // Create new family
    const familyId = uuidv4();
    const family = await familyRepo.create({
      id: familyId,
      name: name.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Assign the current user to the new family
    await userRepo.update(req.user.id, {
      familyId: familyId,
      updated_at: new Date().toISOString()
    });

    console.log('✅ Family created and user assigned:', family);
    return res.json({ family, created: true });
  } catch (error) {
    console.error('Error creating family:', error);
    return res.status(500).json({ error: 'Failed to create family' });
  }
});

// Delete family (SystemAdmin only)
router.delete('/families/:id', authMiddleware, async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'SystemAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  await familyRepo.softDelete(id);
  return res.json({ message: 'Family deleted successfully' });
});

export default router;
