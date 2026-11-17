import { BarraLateral } from '@/components/app/BarraLateral';
import { BarraTopo } from '@/components/app/BarraTopo';
import { NavegacaoInferior } from '@/components/app/NavegacaoInferior';

/**
 * Moldura das seções do plano: menu lateral navy no computador; no celular, barra superior e barra
 * inferior fixa. Fica montada entre as seções (o indicador desliza de uma para outra).
 */
export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col lg:pl-[248px]">
      <BarraLateral />
      <BarraTopo />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-14 lg:pt-7">
        {children}
      </main>
      <NavegacaoInferior />
    </div>
  );
}
