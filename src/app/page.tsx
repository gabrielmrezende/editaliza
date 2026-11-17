import Link from 'next/link';
import { BotaoTema } from '@/components/tema/BotaoTema';
import { botaoPrimario } from '@/components/estilos';

export default function Home() {
  return (
    <>
      <header className="flex justify-end px-4 py-3">
        <BotaoTema />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4">
        <h1 className="text-3xl font-semibold">Editaliza</h1>
        <p>Plano de estudos a partir do edital do seu concurso.</p>
        <Link href="/entrar" className={botaoPrimario}>
          Entrar
        </Link>
      </main>
    </>
  );
}
