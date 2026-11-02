import type { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: number;
      username: string;
      role: 'admin' | 'operator';
    };
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.user) {
    res.status(401).json({ error: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    return;
  }
  next();
}

export function requireRole(allowedRole: 'admin' | 'operator') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.user) {
      res.status(401).json({ error: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' });
      return;
    }

    if (req.session.user.role !== allowedRole && req.session.user.role !== 'admin') {
      res.status(403).json({ error: 'Akses ditolak. Anda tidak memiliki izin untuk tindakan ini.' });
      return;
    }

    next();
  };
}
