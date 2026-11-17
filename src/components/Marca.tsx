/** Logotipo: selo rust com a bolha preenchida da folha de respostas, e o nome. */
export function Marca({ sobreNavy = false, compacta = false }: { sobreNavy?: boolean; compacta?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${sobreNavy ? 'text-na-navy' : 'text-texto'}`}>
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-[10px] bg-rust ${compacta ? 'size-8' : 'size-9'}`}
      >
        <span className="block h-2.5 w-4 rounded-full bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]" />
      </span>
      <span className={compacta ? 'text-base' : 'text-[1.0625rem]'}>Editaliza</span>
    </span>
  );
}
