import Link from 'next/link';
import { Marca } from '@/components/Marca';
import { botaoPrimario } from '@/components/estilos';

export default function NaoEncontrada() {
  return (
    <div className="flex flex-1 flex-col bg-papel text-tinta">
      <header className="mx-auto w-full max-w-5xl px-4 py-5">
        <Marca />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-16 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">Página não encontrada</h1>
        <p className="text-lg">O endereço pode ter mudado ou não existe mais.</p>
        <div>
          <Link href="/" className={botaoPrimario}>
            Ir para o início
          </Link>
        </div>
      </main>
    </div>
  );
}
