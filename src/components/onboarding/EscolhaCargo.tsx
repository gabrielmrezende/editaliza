'use client';

import { useState } from 'react';
import type { ConteudoCargo } from '@/lib/dominio/tipos';
import { alerta, botaoPrimario, botaoSecundario } from '../estilos';
import { pedir } from './api';
import { Lendo } from './Lendo';
import type { EditalVisao } from './tipos';
import { SemConexao } from './SemConexao';
import { useSondagem } from './useSondagem';

type Cargo = EditalVisao['cargos'][number];
type RespostaCargo = { statusConteudo: string; erro: string | null; conteudo: ConteudoCargo | null };

type Estado =
  | { fase: 'escolher'; erro?: string }
  | { fase: 'lendo'; cargo: Cargo }
  | { fase: 'erro'; cargo: Cargo; erro: string };

/** Etapa 2: o aluno escolhe o cargo; o conteúdo programático é extraído (ou reaproveitado). */
export function EscolhaCargo({
  editalId,
  edital,
  aoPronto,
  aoTrocarArquivo,
}: {
  editalId: string;
  edital: EditalVisao;
  aoPronto: (cargoId: string, conteudo: ConteudoCargo) => void;
  aoTrocarArquivo: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'escolher' });
  const cargoLendo = estado.fase === 'lendo' ? estado.cargo : null;
  const urlCargo = (c: Cargo) => `/api/editais/${editalId}/cargos/${c.id}`;

  const sondagem = useSondagem(cargoLendo !== null, async () => {
    const cargo = cargoLendo!;
    const r = await pedir<RespostaCargo>(urlCargo(cargo));
    if (!r.ok) {
      if (r.status === 0) return 'sem_rede';
      setEstado({ fase: 'erro', cargo, erro: r.erro });
      return 'fim';
    }
    if (r.dados.statusConteudo === 'pronto' && r.dados.conteudo) {
      aoPronto(cargo.id, r.dados.conteudo);
      return 'fim';
    }
    if (r.dados.statusConteudo === 'erro') {
      setEstado({ fase: 'erro', cargo, erro: r.dados.erro ?? 'Não conseguimos ler o conteúdo deste cargo.' });
      return 'fim';
    }
    return 'continuar';
  });

  async function escolher(cargo: Cargo) {
    const r = await pedir(urlCargo(cargo), { method: 'POST' });
    if (!r.ok) setEstado({ fase: 'erro', cargo, erro: r.erro });
    else {
      sondagem.reiniciar();
      setEstado({ fase: 'lendo', cargo });
    }
  }

  if (estado.fase === 'lendo') {
    if (sondagem.semConexao) return <SemConexao aoTentar={sondagem.reiniciar} />;
    return <Lendo texto={`Lendo o conteúdo de ${estado.cargo.nome}…`} detalhe="Separando matérias e tópicos do conteúdo programático." />;
  }

  if (estado.fase === 'erro') {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className={alerta}>
          {estado.erro}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={botaoPrimario} onClick={() => escolher(estado.cargo)}>
            Tentar de novo
          </button>
          <button type="button" className={botaoSecundario} onClick={() => setEstado({ fase: 'escolher' })}>
            Escolher outro cargo
          </button>
        </div>
      </div>
    );
  }

  const { orgao, banca, ano } = edital.resumo;
  const origem = [orgao, banca && `banca ${banca}`, ano].filter(Boolean).join(', ');

  if (edital.cargos.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className={alerta}>
          Não encontramos cargos neste edital. Confira se o arquivo é o edital completo.
        </p>
        <div>
          <button type="button" className={botaoSecundario} onClick={aoTrocarArquivo}>
            Enviar outro arquivo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-texto-suave">
        {edital.cargos.length === 1 ? 'Encontramos 1 cargo' : `Encontramos ${edital.cargos.length} cargos`}
        {origem && ` no edital de ${origem}`}.
      </p>
      <ul className="flex flex-col gap-2">
        {edital.cargos.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => escolher(c)}
              className="group flex w-full items-center gap-4 rounded-cartao border border-borda bg-superficie px-4 py-4 text-left text-lg font-bold transition-colors hover:border-acao"
            >
              <span aria-hidden className="h-4 w-6 shrink-0 rounded-full border-2 border-borda-forte transition-colors group-hover:border-acao group-hover:bg-acao" />
              {c.nome}
            </button>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" className="text-sm font-bold text-link underline-offset-4 hover:underline" onClick={aoTrocarArquivo}>
          Enviar outro arquivo
        </button>
      </div>
    </div>
  );
}
