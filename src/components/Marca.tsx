/** Logotipo: uma bolha preenchida, como na folha de respostas, e o nome. */
export function Marca() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-tinta">
      <span aria-hidden className="inline-block h-3.5 w-5 rounded-full bg-caneta" />
      Editaliza
    </span>
  );
}
