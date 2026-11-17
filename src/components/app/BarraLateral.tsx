import { Suspense, cache } from 'react';
import Link from 'next/link';
import { Infinity as IconeCiclo } from 'lucide-react';
import { Marca } from '@/components/Marca';
import { estiloMateria } from '@/components/cores';
import { planoAtivo } from '@/lib/acompanhamento/consultas';
import { dataPorExtenso, diasEntre, hojeEmSaoPaulo } from '@/lib/datas';
import { progresso } from '@/lib/plano/consultas';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { NavegacaoLateral } from './NavegacaoLateral';

/** Plano ativo + tópicos concluídos, lidos uma vez por requisição (cartão e matérias usam os dois). */
const dadosLaterais = cache(async () => {
  const plano = await planoAtivo();
  if (!plano) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('topicos_concluidos').select('topico_id').eq('plano_id', plano.id);
  const feitos = (data ?? []).map((f) => f.topico_id as string);
  return { plano, progresso: progresso(plano.conteudo, feitos) };
});

async function CartaoPlano() {
  const dados = await dadosLaterais();
  if (!dados) return null;
  const { plano } = dados;
  const cargo = plano.edital_cargos;
  const origem = [cargo?.editais?.orgao, cargo?.editais?.ano].filter(Boolean).join(' ');
  const hoje = hojeEmSaoPaulo();
  const faltam = plano.data_prova ? diasEntre(hoje, plano.data_prova) : null;

  return (
    <div className="mx-3.5 mt-4 rounded-cartao border border-white/10 bg-white/[0.06] p-3.5">
      <p className="line-clamp-2 text-sm font-bold leading-snug text-na-navy">{cargo?.nome ?? 'Seu plano'}</p>
      {origem && <p className="mt-0.5 truncate text-xs font-medium text-na-navy-suave">{origem}</p>}
      <div className="mt-3 border-t border-white/10 pt-3">
        {plano.data_prova && faltam !== null && faltam > 0 ? (
          <p className="flex items-end gap-2">
            <span className="text-[1.75rem] font-extrabold leading-none text-na-navy">{faltam}</span>
            <span className="pb-0.5 text-xs leading-tight text-na-navy-suave">
              {faltam === 1 ? 'dia até a prova' : 'dias até a prova'}
              <br />
              {dataPorExtenso(plano.data_prova, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </p>
        ) : plano.data_prova ? (
          <p className="text-xs text-na-navy-suave">
            A prova foi em {dataPorExtenso(plano.data_prova, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xs font-semibold text-na-navy-suave">
            <IconeCiclo aria-hidden className="size-4 text-mint" />
            Ciclo contínuo, sem data de prova
          </p>
        )}
      </div>
    </div>
  );
}

async function Materias() {
  const dados = await dadosLaterais();
  if (!dados || dados.plano.conteudo.length === 0) return null;
  const { plano, progresso: p } = dados;
  return (
    <section aria-labelledby="lateral-materias" className="px-3.5 pb-6 pt-6">
      <h2 id="lateral-materias" className="px-1.5 text-xs font-semibold text-na-navy-suave">
        Matérias
      </h2>
      <ul className="mt-2 flex flex-col gap-0.5">
        {plano.conteudo.map((d, i) => {
          const { total, concluidos } = p.porDisciplina[d.id] ?? { total: 0, concluidos: 0 };
          const pct = total === 0 ? 0 : Math.round((concluidos / total) * 100);
          return (
            <li key={d.id} className="rounded-linha px-1.5 py-2" style={estiloMateria(i)}>
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="bolinha" />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-na-navy">{d.nome}</span>
                <span className="shrink-0 text-[0.6875rem] font-semibold text-na-navy-suave">
                  {concluidos}/{total}
                  <span className="sr-only"> tópicos concluídos</span>
                </span>
              </div>
              <div aria-hidden className="ml-5 mt-1.5 h-1 overflow-hidden rounded-full bg-white/12">
                <div className="barra h-full rounded-full bg-mint" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Menu lateral navy (computador): marca, cartão do plano, seções e matérias com progresso. */
export function BarraLateral() {
  return (
    <aside className="sobre-navy fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-y-auto bg-lateral text-na-navy shadow-[3px_0_20px_rgba(13,19,76,0.12)] lg:flex">
      <div className="border-b border-white/8 px-5 pb-4 pt-5">
        <Link href="/app/plano" className="inline-flex rounded-linha">
          <Marca sobreNavy />
        </Link>
      </div>
      <Suspense fallback={<div className="mx-3.5 mt-4 h-[7.5rem] rounded-cartao bg-white/[0.06]" />}>
        <CartaoPlano />
      </Suspense>
      <NavegacaoLateral />
      <Suspense fallback={null}>
        <Materias />
      </Suspense>
    </aside>
  );
}
