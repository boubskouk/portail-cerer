import './WhatsAppButton.css';

// Bouton flottant WhatsApp (15/09/2026, demande du commanditaire) —
// dépannage rapide sur son numéro personnel, message prérempli. Volontairement
// un composant à part (pas dans Header/Sidebar) pour pouvoir l'afficher aussi
// bien dans AppShell (une fois connecté) que sur les 3 pages publiques
// (Login, mot de passe, demande d'accès) sans dupliquer le lien.
const NUMERO_WHATSAPP = '221776953228'; // Sénégal (+221) — 77 695 32 28
const MESSAGE_PREDEFINI = 'Bonjour, je voudrais de l’aide concernant le Portail CERER Hub :';

const LIEN_WHATSAPP = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(MESSAGE_PREDEFINI)}`;

export function WhatsAppButton() {
  return (
    <a
      href={LIEN_WHATSAPP}
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-fab"
      title="Assistance rapide par WhatsApp"
      aria-label="Assistance rapide par WhatsApp"
    >
      {/* 15/09/2026, demande du commanditaire : libellé "Assistance
          rapide" à gauche de l'icône, pour que le bouton se comprenne d'un
          coup d'œil sans avoir à deviner ce que fait le rond vert. */}
      <span className="whatsapp-fab__label">Assistance rapide</span>
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M16.004 3C9.377 3 4 8.373 4 15c0 2.24.615 4.34 1.687 6.138L4 29l8.06-1.653A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.818a9.77 9.77 0 0 1-4.98-1.363l-.357-.212-4.782.98 1.008-4.66-.233-.373A9.77 9.77 0 0 1 5.182 15c0-5.968 4.854-10.818 10.822-10.818S26.818 9.032 26.818 15 21.972 24.818 16.004 24.818Zm5.978-8.146c-.328-.164-1.94-.957-2.241-1.067-.3-.11-.52-.164-.738.164-.219.328-.848 1.067-1.04 1.286-.192.219-.383.246-.711.082-.328-.164-1.386-.51-2.64-1.627-.976-.87-1.635-1.945-1.827-2.273-.192-.328-.02-.505.144-.668.148-.147.328-.383.492-.574.164-.192.219-.328.328-.547.11-.219.055-.41-.028-.574-.082-.164-.738-1.777-1.012-2.434-.267-.64-.538-.554-.738-.564l-.63-.011c-.219 0-.574.082-.875.41-.3.328-1.148 1.122-1.148 2.735s1.175 3.17 1.339 3.389c.164.219 2.313 3.532 5.605 4.951.783.338 1.394.54 1.87.691.786.25 1.5.215 2.065.13.63-.094 1.94-.793 2.213-1.559.273-.766.273-1.423.191-1.56-.082-.136-.3-.218-.629-.382Z"
        />
      </svg>
    </a>
  );
}
