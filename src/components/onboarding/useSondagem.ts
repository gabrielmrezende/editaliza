import { useEffect, useRef, useState } from 'react';

export const INTERVALO_SONDAGEM_MS = 3000;
/** Falhas de rede seguidas antes de parar e avisar o aluno. */
export const FALHAS_ATE_AVISAR = 3;

/** Resultado de uma consulta: terminou, continua consultando ou não alcançou o servidor. */
export type Passo = 'fim' | 'continuar' | 'sem_rede';

/**
 * Enquanto `ativo`, chama `consultar` agora e a cada 3 s até ela devolver 'fim'.
 * Uma consulta por vez; para ao desmontar ou quando `ativo` vira false. Depois de 3 falhas
 * de rede seguidas, para e devolve `semConexao`; `reiniciar` recomeça (chamar também ao
 * entrar de novo no estado de espera, para não herdar o aviso de uma espera anterior).
 */
export function useSondagem(
  ativo: boolean,
  consultar: () => Promise<Passo>,
): { semConexao: boolean; reiniciar: () => void } {
  const atual = useRef(consultar);
  useEffect(() => {
    atual.current = consultar;
  });
  const [semConexao, setSemConexao] = useState(false);
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let falhas = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const passo = async () => {
      const r = await atual.current();
      if (!vivo || r === 'fim') return;
      falhas = r === 'sem_rede' ? falhas + 1 : 0;
      if (falhas >= FALHAS_ATE_AVISAR) {
        setSemConexao(true);
        return;
      }
      timer = setTimeout(passo, INTERVALO_SONDAGEM_MS);
    };
    void passo();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [ativo, rodada]);

  return {
    semConexao: ativo && semConexao,
    reiniciar: () => {
      setSemConexao(false);
      setRodada((n) => n + 1);
    },
  };
}
