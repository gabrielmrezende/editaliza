import { Suspense } from 'react';
import Form from 'next/form';
import Link from 'next/link';
import { MolduraApp } from '@/components/app/MolduraApp';
import { botaoPrimario, botaoTexto, campo, rotulo } from '@/components/estilos';
import { ListaHistorico } from '@/components/historico/ListaHistorico';
import { POR_PAGINA, materiasDoHistorico, planoAtivo, sessoesDoUsuario } from '@/lib/acompanhamento/consultas';
import { hojeEmSaoPaulo } from '@/lib/datas';

type Busca = Promise<Record<string, string | string[] | undefined>>;

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** aaaa-mm-dd de um dia que existe (2026-02-31 não vale); qualquer outra coisa → undefined. */
function dataValida(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v ? v : undefined;
}

/** Filtros da URL, já validados: página inteira ≥ 1 (senão 1), datas válidas (senão ignoradas). */
function lerFiltros(busca: Awaited<Busca>) {
  const pagina = primeiro(busca.pagina);
  const materia = primeiro(busca.materia)?.trim();
  return {
    pagina: pagina && /^\d{1,6}$/.test(pagina) && Number(pagina) >= 1 ? Number(pagina) : 1,
    materia: materia ? materia.slice(0, 200) : undefined,
    de: dataValida(primeiro(busca.de)),
    ate: dataValida(primeiro(busca.ate)),
  };
}

type Filtros = ReturnType<typeof lerFiltros>;

/** Endereço do histórico com os filtros atuais e outra página. */
function enderecoDaPagina(f: Filtros, pagina: number): string {
  const q = new URLSearchParams();
  if (f.materia) q.set('materia', f.materia);
  if (f.de) q.set('de', f.de);
  if (f.ate) q.set('ate', f.ate);
  if (pagina > 1) q.set('pagina', String(pagina));
  const texto = q.toString();
  return texto ? `/app/historico?${texto}` : '/app/historico';
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const filtros = lerFiltros(await searchParams);
  // O histórico mostra sessões de todos os planos; o plano ativo (se houver) só decide o que dá para editar.
  const [plano, { sessoes, total }, materias] = await Promise.all([
    planoAtivo(),
    sessoesDoUsuario({ pagina: filtros.pagina, disciplinaNome: filtros.materia, de: filtros.de, ate: filtros.ate }),
    materiasDoHistorico(),
  ]);
  const hoje = hojeEmSaoPaulo();
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtrando = Boolean(filtros.materia || filtros.de || filtros.ate);
  const chaveFiltros = `${filtros.materia ?? ''}|${filtros.de ?? ''}|${filtros.ate ?? ''}`;

  return (
    <div className="flex flex-col gap-6">
      {(total > 0 || filtrando) && (
        <Form
          key={chaveFiltros}
          action="/app/historico"
          className="grid gap-4 rounded-xl border border-linha bg-folha p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:p-5"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-materia" className={rotulo}>
              Matéria
            </label>
            <select id="filtro-materia" name="materia" defaultValue={filtros.materia ?? ''} className={`${campo} min-h-11`}>
              <option value="">Todas</option>
              {materias.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-de" className={rotulo}>
              De
            </label>
            <input id="filtro-de" type="date" name="de" defaultValue={filtros.de} max={hoje} className={`${campo} min-h-11`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-ate" className={rotulo}>
              Até
            </label>
            <input id="filtro-ate" type="date" name="ate" defaultValue={filtros.ate} max={hoje} className={`${campo} min-h-11`} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={botaoPrimario}>
              Filtrar
            </button>
            {filtrando && (
              <Link href="/app/historico" className={botaoTexto}>
                Limpar
              </Link>
            )}
          </div>
        </Form>
      )}

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-folha px-5 py-6">
          {filtrando ? 'Nenhuma sessão encontrada com esses filtros.' : 'Nenhuma sessão registrada ainda.'}
        </p>
      ) : sessoes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-folha px-5 py-6">
          Nenhuma sessão nesta página.{' '}
          <Link href={enderecoDaPagina(filtros, 1)} className="font-bold text-caneta underline underline-offset-4">
            Ir para a primeira página
          </Link>
        </p>
      ) : (
        <ListaHistorico
          sessoes={sessoes}
          planoId={plano?.id ?? null}
          disciplinas={plano?.conteudo ?? []}
          hoje={hoje}
        />
      )}

      {total > 0 && sessoes.length > 0 && paginas > 1 && (
        <nav aria-label="Páginas do histórico" className="flex flex-wrap items-center justify-between gap-3">
          {filtros.pagina > 1 ? (
            <Link href={enderecoDaPagina(filtros, filtros.pagina - 1)} className={botaoTexto}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <p className="text-tinta-suave">
            Página {filtros.pagina} de {paginas}
          </p>
          {filtros.pagina < paginas ? (
            <Link href={enderecoDaPagina(filtros, filtros.pagina + 1)} className={botaoTexto}>
              Próxima
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <MolduraApp titulo="Histórico">
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </MolduraApp>
  );
}
