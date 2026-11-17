/** Espera de dados: o texto para leitores de tela e blocos calmos no lugar do conteúdo. */
export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-semibold text-texto-suave">
        {texto}
      </p>
      <div aria-hidden className="h-36 rounded-destaque bg-borda/60" />
      <div aria-hidden className="h-20 rounded-cartao bg-borda/45" />
      <div aria-hidden className="h-20 rounded-cartao bg-borda/30" />
    </div>
  );
}
