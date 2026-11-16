import { useEffect, useRef } from 'react';

export const INTERVALO_SONDAGEM_MS = 3000;

/**
 * Enquanto `ativo`, chama `consultar` agora e a cada 3 s até ela devolver true (terminou).
 * Uma consulta por vez; para ao desmontar ou quando `ativo` vira false.
 */
export function useSondagem(ativo: boolean, consultar: () => Promise<boolean>): void {
  const atual = useRef(consultar);
  useEffect(() => {
    atual.current = consultar;
  });

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const passo = async () => {
      const terminou = await atual.current();
      if (vivo && !terminou) timer = setTimeout(passo, INTERVALO_SONDAGEM_MS);
    };
    void passo();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [ativo]);
}
