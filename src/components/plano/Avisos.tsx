import { CircleAlert } from 'lucide-react';
import type { Aviso, DisciplinaPlano } from '@/lib/dominio/tipos';

/** Explica em português cada aviso do gerador; nao_cabe lista os tópicos que ficaram de fora. */
export function Avisos({ avisos, disciplinas }: { avisos: Aviso[]; disciplinas: DisciplinaPlano[] }) {
  if (avisos.length === 0) return null;
  const nomeTopico = new Map(disciplinas.flatMap((d) => d.topicos.map((t) => [t.id, `${t.nome} (${d.nome})`] as const)));

  return (
    <section aria-label="Avisos do plano" className="flex flex-col gap-2">
      {avisos.map((a) => (
        <div key={a.tipo} className="flex gap-3 rounded-linha border border-borda bg-superficie px-4 py-3 text-sm text-texto-medio">
          <CircleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0 text-aviso" />
          <div className="min-w-0 flex-1">
            {a.tipo === 'nao_cabe' ? (
              <>
                <p>
                  <strong className="text-texto">
                    {a.topicosFora.length === 1
                      ? '1 tópico não coube até a prova.'
                      : `${a.topicosFora.length} tópicos não couberam até a prova.`}
                  </strong>{' '}
                  Demos prioridade às matérias de maior peso. Mais horas por semana ou menos tópicos fazem caber mais.
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold text-link">Ver tópicos de fora</summary>
                  <ul className="mt-2 list-disc pl-5">
                    {a.topicosFora.map((id) => (
                      <li key={id}>{nomeTopico.get(id) ?? id}</li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <p>{TEXTO[a.tipo]}</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

const TEXTO: Record<Exclude<Aviso['tipo'], 'nao_cabe'>, string> = {
  pesos_assumidos: 'O edital não informa o peso das matérias, então consideramos todas com o mesmo peso.',
  sem_tempo: 'Você não informou horas de estudo na semana, então o plano não tem blocos. Crie um novo plano com seus horários.',
  data_invalida: 'A data da prova já passou, então montamos um ciclo contínuo de matérias.',
};
