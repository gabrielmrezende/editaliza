import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import type { Sessao } from '@/lib/dominio/acompanhamento';
import { intervaloDoPeriodo, totaisDoIntervalo } from '@/lib/acompanhamento/relatorio';
import { formatarMinutos } from '@/lib/formatar';
import { progresso } from '@/lib/plano/consultas';

/** Uma linha: % do edital (tópicos concluídos), horas desta semana e acerto da semana (só com questões). */
export function MeuProgresso({
  disciplinas,
  concluidos,
  sessoes,
  hoje,
}: {
  disciplinas: DisciplinaPlano[];
  concluidos: string[];
  sessoes: Sessao[];
  hoje: string;
}) {
  const p = progresso(disciplinas, concluidos);
  const percentual = p.total > 0 ? Math.round((100 * p.concluidos) / p.total) : 0;
  const semana = totaisDoIntervalo(sessoes, intervaloDoPeriodo('semana', hoje, hoje));
  const numero = 'font-semibold text-texto tabular-nums';

  return (
    <section aria-label="Meu progresso" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-texto-suave">
      <p className="flex items-center gap-3">
        <span>
          <span className={numero}>{percentual}%</span> do edital
        </span>
        <span aria-hidden className="h-1.5 w-24 overflow-hidden rounded-full bg-borda">
          <span className="barra block h-full rounded-full bg-mint-forte" style={{ width: `${percentual}%` }} />
        </span>
      </p>
      <p>
        <span className={numero}>{formatarMinutos(semana.minutos)}</span> esta semana
      </p>
      {semana.percentualAcerto !== null && (
        <p>
          <span className={numero}>{semana.percentualAcerto}%</span> de acerto
        </p>
      )}
    </section>
  );
}
