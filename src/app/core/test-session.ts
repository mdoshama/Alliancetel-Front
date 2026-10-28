import { Me, Role } from './models';

/** Writes a signed-in session to localStorage before AuthService is created (test helper). */
export function storeTestSession(role: Role, overrides: Partial<Me> = {}): Me {
  const user: Me = {
    id: 7,
    employeeCode: 'AT-0007',
    fullName: 'Sam Rivera',
    email: 'sam@alliancetel.example',
    role,
    areaId: role === 'ADMIN' ? null : 2,
    areaName: role === 'ADMIN' ? null : 'San Diego',
    mustChangePassword: false,
    ...overrides,
  };
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  localStorage.setItem('alliancetel.session', JSON.stringify({ token: 'test-token', expiresAt, user }));
  return user;
}
