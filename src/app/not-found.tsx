import Link from 'next/link';
import { Marca } from '@/components/Marca';
import { botaoPrimario } from '@/components/estilos';

export default function NaoEncontrada() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Link href="/" className="inline-flex rounded-linha">
          <Marca />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-5 pb-24">
        <p aria-hidden className="flex gap-1.5">
          {[0, 1, 0].map((cheia, i) => (
            <span key={i} className={`h-4 w-7 rounded-full border-2 ${cheia ? 'border-rust bg-rust' : 'border-borda-forte'}`} />
          ))}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Página não encontrada</h1>
        <p className="text-lg text-texto-medio">O endereço pode ter mudado ou não existe mais.</p>
        <div className="mt-2">
          <Link href="/" className={`${botaoPrimario} min-h-12`}>
            Ir para o início
          </Link>
        </div>
      </main>
    </div>
  );
}
