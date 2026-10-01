import type { ReactNode } from 'react';

interface FieldProps {
  label: ReactNode;
  required?: boolean;
  error?: string;
  span?: 2;
  children: ReactNode;
}

// Enveloppe de champ de formulaire : libellé, astérisque obligatoire,
// message d'erreur (§5.3 / §7 du README de handoff).
export function Field({ label, required, error, span, children }: FieldProps) {
  return (
    <label
      className={`field ${error ? 'has-error' : ''}`}
      style={span ? { gridColumn: `span ${span}` } : undefined}
    >
      <span className="field__label">
        {label} {required && <span className="field__req">*</span>}
      </span>
      {children}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}
