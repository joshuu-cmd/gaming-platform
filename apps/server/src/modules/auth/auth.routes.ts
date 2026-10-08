import { Router } from 'express';
import * as controller from './auth.controller.js';
import { optionalAuth, rateLimit } from './auth.schema.js';

export const authRoutes = Router();

authRoutes.post('/register', rateLimit(5, 60 * 60 * 1000), controller.register);
authRoutes.post('/verify', rateLimit(12, 15 * 60 * 1000), controller.verifyContact);
authRoutes.post('/resend', rateLimit(3, 15 * 60 * 1000), controller.resendVerification);
authRoutes.post('/forgot-password', rateLimit(3, 15 * 60 * 1000), controller.requestPasswordReset);
authRoutes.post('/reset-password', rateLimit(8, 15 * 60 * 1000), controller.resetPassword);
authRoutes.post('/login', rateLimit(10, 15 * 60 * 1000), controller.login);
authRoutes.post('/logout', optionalAuth, controller.logout);
authRoutes.get('/me', optionalAuth, controller.me);
