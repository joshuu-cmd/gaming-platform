import { GameError } from '../games/game.service.js';

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey && !from && process.env.NODE_ENV !== 'production') {
    console.info('[local email verification]', { to, subject, text });
    return;
  }
  if (!apiKey || !from) throw new GameError('Email verification delivery is not configured.', 503);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) throw new GameError('Email could not be sent. Please try again.', 503);
}

async function sendSms(to: string, message: string): Promise<void> {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME;
  if (!apiKey && !username && process.env.NODE_ENV !== 'production') {
    console.info('[local SMS verification]', { to, message });
    return;
  }
  if (!apiKey || !username) throw new GameError('SMS verification delivery is not configured.', 503);

  const body = new URLSearchParams({ username, to, message });
  const senderId = process.env.AFRICASTALKING_SENDER_ID;
  if (senderId) body.set('from', senderId);

  const response = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new GameError('SMS could not be sent. Please try again.', 503);
}

export async function sendEmailVerification(email: string, code: string): Promise<void> {
  await sendEmail(email, 'Verify your Gaming Platform account', `Your email verification code is ${code}. It expires in 10 minutes.`);
}

export async function sendPhoneVerification(phoneE164: string, code: string): Promise<void> {
  await sendSms(phoneE164, `Gaming Platform verification code: ${code}. It expires in 10 minutes.`);
}

export async function sendPasswordReset(email: string, code: string): Promise<void> {
  await sendEmail(email, 'Reset your Gaming Platform password', `Your password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`);
}
