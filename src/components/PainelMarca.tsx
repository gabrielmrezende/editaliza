import { Marca } from './Marca';

/**
 * Painel navy das telas de fora (início e entrar): a marca, a promessa do produto e, no
 * computador, uma prévia do cartão "Agora" (só ilustração).
 */
export function PainelMarca({ children }: { children?: React.ReactNode }) {
  return (
    <section className="sobre-navy relative flex flex-col overflow-hidden bg-lateral px-5 pb-8 pt-5 text-na-navy sm:px-8 lg:min-h-dvh lg:w-[46%] lg:max-w-[40rem] lg:px-12 lg:pb-12 lg:pt-10">
      <Marca sobreNavy />
      <div className="mt-8 flex flex-col gap-3 lg:mt-auto">
        <p className="max-w-[17ch] text-[1.75rem] font-semibold leading-[1.12] tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">
          Seu edital vira um plano de estudo para cada dia.
        </p>
        <p className="max-w-[42ch] text-na-navy-suave sm:text-lg">
          Envie o PDF, confira as matérias e comece pelo bloco de hoje. O plano se ajusta ao que você estuda.
        </p>
        {children}
      </div>

      {/* Prévia do cartão "Agora" (decorativa). */}
      <div aria-hidden className="mt-12 hidden max-w-sm rotate-[-1.5deg] rounded-destaque bg-white/[0.07] p-5 ring-1 ring-white/10 lg:block">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-mint">
          <span className="size-2 rounded-full bg-mint" />
          Agora
        </span>
        <p className="mt-3 flex items-center gap-2 text-sm text-na-navy-suave">
          <span className="bolinha" style={{ '--cor-materia': '#E255BE' } as React.CSSProperties} />
          Direito Administrativo
        </p>
        <p className="mt-1 text-xl font-semibold leading-tight">Princípios da administração pública</p>
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-linha bg-mint px-4 py-2 text-sm font-semibold text-na-mint">Iniciar</span>
          <span className="rounded-linha border border-white/25 px-4 py-2 text-sm font-semibold">Estudei</span>
        </div>
      </div>
      <div aria-hidden className="mt-8 hidden gap-1.5 lg:flex">
        {[1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0].map((cheia, i) => (
          <span key={i} className={`h-3 w-5 rounded-full border-2 ${cheia ? 'border-mint bg-mint' : 'border-white/25'}`} />
        ))}
      </div>
    </section>
  );
}
