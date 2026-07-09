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
      user: {
        id: userId,
        email: userEmail,
        name: userName || '',
        ai_config: existingUser ? existingUser.ai_config : null,
        search_config: existingUser ? existingUser.search_config : null,
        telegram_config: existingUser ? existingUser.telegram_config : null,
        telegram_chat_id: existingUser ? existingUser.telegram_chat_id : null,
        e2ee_enabled: existingUser ? existingUser.e2ee_enabled : 0
      },
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
    const user = db.prepare('SELECT id, email, name, avatar_url, telegram_chat_id, ai_config, search_config, telegram_config, e2ee_enabled, created_at, updated_at FROM users WHERE id = ?')
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

let systemBotInfo: { username: string; first_name: string } | null = null;

/**
 * POST /telegram
 * Update the current user's telegram_chat_id.
 */
router.post('/telegram', authenticateToken, (req: Request, res: Response) => {
  try {
    const { telegramChatId } = req.body;
    const db = getDatabase();
    db.prepare('UPDATE users SET telegram_chat_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(telegramChatId || null, req.user!.userId);
    res.json({ success: true, message: 'Telegram Chat ID updated successfully.' });
  } catch (error) {
    console.error('Update Telegram Chat ID error:', error);
    res.status(500).json({ success: false, error: 'Failed to update Telegram Chat ID.' });
  }
});

/**
 * POST /settings
 * Update the current user's configurations (AI, Search, Telegram).
 */
router.post('/settings', authenticateToken, (req: Request, res: Response) => {
  try {
    const { aiConfig, searchConfig, telegramConfig, e2eeEnabled } = req.body;
    const db = getDatabase();

    let telegramChatId: string | null = null;
    if (telegramConfig) {
      try {
        const parsed = typeof telegramConfig === 'string' ? JSON.parse(telegramConfig) : telegramConfig;
        telegramChatId = parsed.chatId || null;
      } catch (err) {
        // Ignore JSON parsing errors and look for direct object shape
        if (typeof telegramConfig === 'object') {
          telegramChatId = telegramConfig.chatId || null;
        }
      }
    }

    const aiStr = aiConfig ? (typeof aiConfig === 'object' ? JSON.stringify(aiConfig) : aiConfig) : null;
    const searchStr = searchConfig ? (typeof searchConfig === 'object' ? JSON.stringify(searchConfig) : searchConfig) : null;
    const telegramStr = telegramConfig ? (typeof telegramConfig === 'object' ? JSON.stringify(telegramConfig) : telegramConfig) : null;

    if (telegramChatId) {
      db.prepare(`
        UPDATE users 
        SET ai_config = COALESCE(?, ai_config), 
            search_config = COALESCE(?, search_config), 
            telegram_config = COALESCE(?, telegram_config), 
            telegram_chat_id = COALESCE(?, telegram_chat_id), 
            e2ee_enabled = COALESCE(?, e2ee_enabled),
            updated_at = datetime('now') 
        WHERE id = ?
      `).run(aiStr, searchStr, telegramStr, telegramChatId, e2eeEnabled !== undefined ? (e2eeEnabled ? 1 : 0) : null, req.user!.userId);
    } else {
      db.prepare(`
        UPDATE users 
        SET ai_config = COALESCE(?, ai_config), 
            search_config = COALESCE(?, search_config), 
            telegram_config = COALESCE(?, telegram_config), 
            e2ee_enabled = COALESCE(?, e2ee_enabled),
            updated_at = datetime('now') 
        WHERE id = ?
      `).run(aiStr, searchStr, telegramStr, e2eeEnabled !== undefined ? (e2eeEnabled ? 1 : 0) : null, req.user!.userId);
    }

    res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (error) {
    console.error('Save settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to save settings.' });
  }
});

/**
 * POST /telegram/send
 * Send a telegram message to the authenticated user using the system bot.
 */
router.post('/telegram/send', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { title, body } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      res.status(400).json({ success: false, error: 'Telegram Bot not configured on server' });
      return;
    }

    const db = getDatabase();
    const user = db.prepare('SELECT telegram_chat_id FROM users WHERE id = ?')
      .get(req.user!.userId) as { telegram_chat_id: string | null } | undefined;

    if (!user || !user.telegram_chat_id) {
      res.status(400).json({ success: false, error: 'Telegram Chat ID not linked for this user' });
      return;
    }

    const message = `🔔 *${title}*\n\n${body}`;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegram_chat_id,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (response.ok) {
      res.json({ success: true, message: 'Notification sent successfully.' });
    } else {
      const errText = await response.text();
      console.error('Telegram bot send error response:', errText);
      res.status(500).json({ success: false, error: 'Telegram API returned an error.' });
    }
  } catch (error) {
    console.error('Send Telegram message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send Telegram message.' });
  }
});

/**
 * GET /telegram/bot-info
 * Fetch configured Telegram bot username and first name.
 */
router.get('/telegram/bot-info', async (req: Request, res: Response) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      res.json({ success: false, error: 'Telegram Bot not configured on server' });
      return;
    }

    if (systemBotInfo) {
      res.json({ success: true, data: systemBotInfo });
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (response.ok) {
      const body = await response.json() as any;
      if (body.ok && body.result) {
        systemBotInfo = {
          username: body.result.username,
          first_name: body.result.first_name,
        };
        res.json({ success: true, data: systemBotInfo });
        return;
      }
    }
    res.json({ success: false, error: 'Failed to fetch bot info from Telegram.' });
  } catch (error) {
    console.error('Get Telegram Bot Info error:', error);
    res.json({ success: false, error: 'Failed to fetch bot info.' });
  }
});

export default router;
