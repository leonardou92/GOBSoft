import crypto from 'crypto';

const SALT = Buffer.from('Ivan Medvedev', 'utf8');
const ITERATIONS = 1000;
const KEYLEN = 48;
const DIGEST = 'sha1';

const deriveKeyAndIv = (secret: string) => {
  const pbkdf2 = crypto.pbkdf2Sync(secret, SALT, ITERATIONS, KEYLEN, DIGEST);
  const key = pbkdf2.subarray(0, 32);
  const iv = pbkdf2.subarray(32);
  return { key, iv };
};

export const encryptToBase64 = (plain: string, secret: string): string => {
  const { key, iv } = deriveKeyAndIv(secret);
  const plainBuf = Buffer.from(plain, 'utf16le'); // UTF-16LE como en el ejemplo PHP

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuf), cipher.final()]);

  return encrypted.toString('base64');
};

export const decryptFromBase64 = (cipherBase64: string, secret: string): string => {
  const { key, iv } = deriveKeyAndIv(secret);
  const cipherBuf = Buffer.from(cipherBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);

  return decrypted.toString('utf16le');
};

export const sha256Utf8 = (data: string): string => {
  return crypto.createHash('sha256').update(Buffer.from(data, 'utf8')).digest('hex');
};

export const encryptJson = (obj: unknown, secret: string): { value: string; validation: string; originalJson: string } => {
  const originalJson = JSON.stringify(obj);
  const value = encryptToBase64(originalJson, secret);
  const validation = sha256Utf8(originalJson);

  return { value, validation, originalJson };
};

export const decryptJson = <T = unknown>(cipherBase64: string, secret: string): T => {
  const decrypted = decryptFromBase64(cipherBase64, secret);
  return JSON.parse(decrypted) as T;
};

