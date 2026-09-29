// Gerenciamento de segurança e proteção por senha mestre

const VALID_MASTER_PASSWORDS = [
  'senha1010',
];

const SESSION_AUTH_KEY = 'mp_master_auth_session';

export function verifyMasterPassword(password: string): boolean {
  if (!password) return false;
  const clean = password.trim();
  return VALID_MASTER_PASSWORDS.includes(clean);
}

export function isMasterUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_AUTH_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setMasterUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) {
      sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
    } else {
      sessionStorage.removeItem(SESSION_AUTH_KEY);
    }
  } catch {
    // Ignore session storage errors
  }
}
