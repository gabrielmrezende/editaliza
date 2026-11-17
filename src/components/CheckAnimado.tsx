/** Check que se desenha ao aparecer (confirmação de "Registrado" / "Sessão registrada"). */
export function CheckAnimado({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`check-animado shrink-0 ${className}`}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
