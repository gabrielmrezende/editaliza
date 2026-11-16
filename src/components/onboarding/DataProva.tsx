'use client';

import { useState } from 'react';
import { dataPorExtenso, diasEntre, hojeEmSaoPaulo, somarDias } from '@/lib/datas';
import { MAX_DIAS_ATE_PROVA, MSG_DATA_DISTANTE, MSG_DATA_PASSADA } from '@/lib/planos/mensagens';
import { alerta, campo, rotulo } from '../estilos';
import { Navegacao } from './Navegacao';

/** Etapa 4: data da prova (pré-preenchida com a do edital) ou "ainda não saiu". */
export function DataProva({
  data,
  semData,
  dataDoEdital,
  aoMudar,
  aoContinuar,
  aoVoltar,
}: {
  data: string;
  semData: boolean;
  dataDoEdital: string | null;
  aoMudar: (v: { data: string; semData: boolean }) => void;
  aoContinuar: () => void;
  aoVoltar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const hoje = hojeEmSaoPaulo();
  const limite = somarDias(hoje, MAX_DIAS_ATE_PROVA);
  const formatoOk = !semData && /^\d{4}-\d{2}-\d{2}$/.test(data);
  const valida = formatoOk && data > hoje && data <= limite;
  const faltam = valida ? diasEntre(hoje, data) : null;

  function continuar() {
    if (semData) return aoContinuar();
    if (!data) return setErro('Informe a data da prova ou marque que ela ainda não saiu.');
    if (!valida) return setErro(formatoOk && data > limite ? MSG_DATA_DISTANTE : MSG_DATA_PASSADA);
    aoContinuar();
  }

  const mudar = (v: { data: string; semData: boolean }) => {
    setErro(null);
    aoMudar(v);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="data-prova" className={rotulo}>
          Data da prova
        </label>
        <input
          id="data-prova"
          type="date"
          min={somarDias(hoje, 1)}
          max={limite}
          value={semData ? '' : data}
          disabled={semData}
          aria-describedby="data-ajuda"
          aria-invalid={erro !== null && !semData}
          onChange={(e) => mudar({ data: e.target.value, semData })}
          className={`${campo} max-w-56 disabled:opacity-50`}
        />
        <p id="data-ajuda" className="text-sm text-tinta-suave">
          {semData
            ? 'Sem data, montamos um ciclo contínuo de matérias. Você atualiza quando a data sair.'
            : faltam !== null
              ? `${dataPorExtenso(data, { day: 'numeric', month: 'long', year: 'numeric' })}: faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'}.`
              : dataDoEdital
                ? 'Preenchemos com a data que está no edital.'
                : 'O edital não informa a data.'}
        </p>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={semData}
          onChange={(e) => mudar({ data, semData: e.target.checked })}
          className="h-5 w-5 accent-caneta"
        />
        A data ainda não saiu
      </label>

      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <Navegacao aoVoltar={aoVoltar} aoContinuar={continuar} />
    </div>
  );
}
