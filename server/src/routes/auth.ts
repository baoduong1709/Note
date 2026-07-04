import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /google
 * Verify Google OAuth credential and issue a JWT token.
 * Upserts the user record in the database.
 */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential, email, name, picture } = req.body;
    let userEmail: string;
    let userName: string;
    let userPicture: string | undefined;

    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (credential) {
      try {
        // Try verifying as Google ID token first
        if (!clientId) throw new Error('No GOOGLE_CLIENT_ID configured');
        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        if (!payload?.email) throw new Error('No email in ID token payload');
        userEmail = payload.email;
        userName = payload.name || email || 'User';
        userPicture = payload.picture;
      } catch {
        // ID token verification failed — try as access_token
        // Verify by calling Google's userinfo endpoint
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${credential}` },
        });
        if (!response.ok) {
          res.status(401).json({ success: false, error: 'Invalid credential.' });
          return;
        }
        const userInfo = await response.json() as { email?: string; name?: string; picture?: string };
        if (!userInfo.email) {
          res.status(401).json({ success: false, error: 'No email in token.' });
          return;
        }
        userEmail = userInfo.email;
        userName = userInfo.name || name || 'User';
        userPicture = userInfo.picture || picture;
      }
    } else if (email) {
      // Direct user info (no verification — for development only)
      userEmail = email;
      userName = name || 'User';
      userPicture = picture;
    } else {
      res.status(400).json({ success: false, error: 'Missing credential or email.' });
      return;
    }

    const db = getDatabase();

    // Check if user already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail) as any;

    let userId: string;

    if (existingUser) {
      // Update existing user
      userId = existingUser.id;
      db.prepare(`
        UPDATE users SET name = ?, avatar_url = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(userName || existingUser.name, userPicture || existingUser.avatar_url, userId);
    } else {
      // Create new user
      userId = uuidv4();
      db.prepare(`
        INSERT INTO users (id, email, name, avatar_url) VALUES (?, ?, ?, ?)
      `).run(userId, userEmail, userName || '', userPicture || '');
    }

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET!;
    const token = jwt.sign(
      { userId, email: userEmail },
      jwtSecret,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: { id: userId, email: userEmail, name: userName || '' },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed.' });
  }
});

/**
 * GET /me
 * Return the currently authenticated user's info from the database.
 */
router.get('/me', authenticateToken, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const user = db.prepare('SELECT id, email, name, avatar_url, created_at, updated_at FROM users WHERE id = ?')
      .get(req.user!.userId) as any;

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user info.' });
  }
});

export default router;
