/** Estado de espera: linhas de texto sendo grifadas por um marca-texto. */
export function Lendo({ texto, detalhe }: { texto: string; detalhe?: string }) {
  return (
    <div role="status" className="flex flex-col gap-4 rounded-cartao border border-borda bg-superficie p-6">
      <div aria-hidden className="flex flex-col gap-2.5">
        {[92, 78, 85, 60].map((largura, i) => (
          <span key={i} className="relative block h-2.5 overflow-hidden rounded-full bg-borda" style={{ width: `${largura}%` }}>
            <span className="grifo absolute inset-y-0 left-0 rounded-full bg-mint" style={{ animationDelay: `${i * 0.45}s` }} />
          </span>
        ))}
      </div>
      <div>
        <p className="text-lg font-bold">{texto}</p>
        {detalhe && <p className="text-texto-suave">{detalhe}</p>}
      </div>
    </div>
  );
}
