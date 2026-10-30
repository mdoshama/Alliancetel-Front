import { passwordProblem } from './password-rules';

describe('passwordProblem', () => {
  const me = ['Dana Reyes', 'dana.reyes@alliancetel.example'];

  it('accepts a good password', () => {
    expect(passwordProblem('Harbor-Lamp-482', me)).toBeNull();
    expect(passwordProblem('tacos4breakfast', me)).toBeNull();
  });

  it('explains what is wrong', () => {
    expect(passwordProblem('Short1')).toContain('at least 10');
    expect(passwordProblem('NoDigitsHereAtAll')).toContain('letter and one number');
    expect(passwordProblem('aaaaaaaa11')).toContain('same few characters');
    expect(passwordProblem(' Spaced-Out-5')).toContain('space');
    expect(passwordProblem('x'.repeat(70) + '1')).toContain('at most 64');
    expect(passwordProblem('Reyes-Blue-77', me)).toContain('name or email');
    expect(passwordProblem('dana.blue-9x', me)).toContain('name or email');
  });
});
