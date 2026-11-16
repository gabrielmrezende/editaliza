import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-semibold">Editaliza</h1>
      <p>Plano de estudos a partir do edital do seu concurso.</p>
      <Link href="/entrar" className="rounded bg-black px-4 py-2 text-white">
        Entrar
      </Link>
    </main>
  );
}
