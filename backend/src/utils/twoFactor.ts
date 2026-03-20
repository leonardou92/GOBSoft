import crypto from 'crypto';
import speakeasy from 'speakeasy';

function getEncryptionKey(): Buffer {
  const raw =
    process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!raw) {
    throw new Error(
      'No hay clave de cifrado para 2FA. Configure TWO_FACTOR_ENCRYPTION_KEY o JWT_SECRET.',
    );
  }

  // Derivar una clave de 32 bytes estable para AES-256-GCM.
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptTwoFactorSecret(secret: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Formato: iv:tag:data (base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptTwoFactorSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = String(payload).split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de secreto 2FA cifrado inválido.');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
}

