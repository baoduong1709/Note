import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ---------------------------------------------------------------------------
// SSRF Protection: Block requests to private/internal IP ranges
// ---------------------------------------------------------------------------

/**
 * Check whether a URL is safe to proxy.
 * Blocks private/internal IPs and only allows http/https schemes.
 */
function isUrlAllowed(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  // Only allow http and https schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and common loopback aliases
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname === '::1'
  ) {
    return false;
  }

  // Block private/internal IP ranges
  const ipParts = hostname.split('.').map(Number);
  if (ipParts.length === 4 && ipParts.every((p) => !isNaN(p))) {
    const [a, b] = ipParts;

    // 127.x.x.x — loopback
    if (a === 127) return false;
    // 10.x.x.x — private
    if (a === 10) return false;
    // 172.16.0.0 – 172.31.255.255 — private
    if (a === 172 && b >= 16 && b <= 31) return false;
    // 192.168.x.x — private
    if (a === 192 && b === 168) return false;
    // 169.254.x.x — link-local
    if (a === 169 && b === 254) return false;
    // 0.x.x.x — reserved
    if (a === 0) return false;
  }

  return true;
}

/**
 * POST /ai
 * Proxy AI requests. Reads target URL from x-target-url header,
 * forwards the request body, and returns the AI response.
 */
router.post('/ai', async (req: Request, res: Response) => {
  try {
    const targetUrl = req.headers['x-target-url'] as string;

    if (!targetUrl) {
      res.status(400).json({ success: false, error: 'x-target-url header is required.' });
      return;
    }

    // SSRF protection
    if (!isUrlAllowed(targetUrl)) {
      res.status(403).json({ success: false, error: 'Target URL is not allowed (blocked by SSRF protection).' });
      return;
    }

    // Forward the request to the target URL
    const proxyResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward authorization headers if present (for API keys, etc.)
        ...(req.headers['x-api-key'] ? { 'Authorization': `Bearer ${req.headers['x-api-key']}` } : {}),
        ...(req.headers['x-auth-header'] ? { 'Authorization': req.headers['x-auth-header'] as string } : {}),
      },
      body: JSON.stringify(req.body),
    });

    const data = await proxyResponse.text();

    // Try to parse as JSON, otherwise return as text
    try {
      const jsonData = JSON.parse(data);
      res.status(proxyResponse.status).json({ success: true, data: jsonData });
    } catch {
      res.status(proxyResponse.status).json({ success: true, data });
    }
  } catch (error) {
    console.error('AI proxy error:', error);
    res.status(500).json({ success: false, error: 'AI proxy request failed.' });
  }
});

/**
 * ALL /fetch
 * Generic proxy endpoint. Reads target URL from x-target-url header,
 * forwards the request method, headers, and body.
 */
router.all('/fetch', async (req: Request, res: Response) => {
  try {
    const targetUrl = req.headers['x-target-url'] as string;

    if (!targetUrl) {
      res.status(400).json({ success: false, error: 'x-target-url header is required.' });
      return;
    }

    // SSRF protection
    if (!isUrlAllowed(targetUrl)) {
      res.status(403).json({ success: false, error: 'Target URL is not allowed (blocked by SSRF protection).' });
      return;
    }

    // Build headers to forward (exclude hop-by-hop, internal, and sensitive headers)
    const excludeHeaders = new Set([
      'host', 'connection', 'x-target-url',
      'content-length', 'transfer-encoding',
      'authorization',
    ]);

    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!excludeHeaders.has(key.toLowerCase()) && typeof value === 'string') {
        forwardHeaders[key] = value;
      }
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    };

    // Include body for non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
      if (!forwardHeaders['content-type']) {
        forwardHeaders['content-type'] = 'application/json';
      }
    }

    const proxyResponse = await fetch(targetUrl, fetchOptions);
    const data = await proxyResponse.text();

    // Forward response status and attempt JSON parsing
    try {
      const jsonData = JSON.parse(data);
      res.status(proxyResponse.status).json({ success: true, data: jsonData });
    } catch {
      res.status(proxyResponse.status).json({ success: true, data });
    }
  } catch (error) {
    console.error('Fetch proxy error:', error);
    res.status(500).json({ success: false, error: 'Proxy request failed.' });
  }
});

export default router;
