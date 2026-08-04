export const PASSWORD_MIN_LENGTH = 12;

const UPPERCASE_PATTERN = /[A-Z]/;
const LOWERCASE_PATTERN = /[a-z]/;
const DIGIT_PATTERN = /[0-9]/;
const SPECIAL_PATTERN = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~`]/;

export type PasswordRequirement = {
  label: string;
  met: boolean;
};

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: `Minimum ${PASSWORD_MIN_LENGTH} znaków`, met: password.length >= PASSWORD_MIN_LENGTH },
    { label: "Jedna mała litera", met: LOWERCASE_PATTERN.test(password) },
    { label: "Jedna duża litera", met: UPPERCASE_PATTERN.test(password) },
    { label: "Jedna cyfra", met: DIGIT_PATTERN.test(password) },
    { label: "Jeden znak specjalny (!@#$%^&*)", met: SPECIAL_PATTERN.test(password) },
  ];
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors = getPasswordRequirements(password)
    .filter((requirement) => !requirement.met)
    .map((requirement) => `Hasło musi spełniać wymaganie: ${requirement.label.toLowerCase()}`);

  return { valid: errors.length === 0, errors };
}
