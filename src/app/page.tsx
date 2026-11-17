import Link from 'next/link';
import { PainelMarca } from '@/components/PainelMarca';
import { BotaoTema } from '@/components/tema/BotaoTema';

const PASSOS = [
  { titulo: 'Envie o edital', texto: 'O PDF como foi publicado. Encontramos os cargos e o conteúdo.' },
  { titulo: 'Confira as matérias', texto: 'Ajuste tópicos, a data da prova e as horas que você tem.' },
  { titulo: 'Estude o bloco de hoje', texto: 'Cronômetro, revisões e um relatório do que você estudou.' },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col lg:flex-row">
      <div className="absolute right-4 top-4 z-10 sm:right-6">
        <BotaoTema />
      </div>
      <PainelMarca />
      <main className="flex flex-1 flex-col px-5 py-10 sm:px-8 lg:justify-center">
        <div className="mx-auto flex w-full max-w-md flex-col gap-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Do edital ao plano em três passos</h1>
          {/* Os passos são de fato uma sequência: por isso a numeração. */}
          <ol className="flex flex-col gap-5">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-suave text-sm font-semibold text-texto">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{p.titulo}</p>
                  <p className="text-sm text-texto-suave">{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <Link
              href="/entrar"
              className="inline-flex min-h-12 items-center gap-2 rounded-linha bg-acao px-6 font-semibold text-na-acao transition-colors hover:bg-acao-hover"
            >
              Entrar
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
