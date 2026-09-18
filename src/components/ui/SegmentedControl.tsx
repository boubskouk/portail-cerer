interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'header' | 'default';
}

// Sélecteur segmenté réutilisable : rôle (en-tête), variante A/B, filtres
// DRH, bascule Oui/Non. Un seul composant, plusieurs jeux d'options.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = 'default',
}: SegmentedControlProps<T>) {
  return (
    <div className={`segmented ${variant === 'header' ? 'segmented--in-header' : ''}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`segmented__btn ${value === opt.value ? 'is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
