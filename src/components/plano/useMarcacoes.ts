import { useRef, useState } from 'react';

const MSG_FALHA = 'Não foi possível salvar a marcação. Confira sua internet e tente de novo.';

/**
 * Tópicos concluídos com gravação otimista e serializada por tópico: cliques rápidos
 * (marca/desmarca/marca) viram no máximo uma requisição em voo por tópico, e ao fim o servidor
 * fica com o último estado escolhido. Em falha, volta ao último estado confirmado.
 */
export function useMarcacoes(planoId: string, iniciais: string[]) {
  const [concluidos, setConcluidos] = useState(() => new Set(iniciais));
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const confirmados = useRef(new Set(iniciais)); // estado conhecido no servidor
  const desejados = useRef(new Map<string, boolean>());
  const emVoo = useRef(new Set<string>());

  const aplicar = (topicoId: string, marcado: boolean) =>
    setConcluidos((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(topicoId);
      else novo.delete(topicoId);
      return novo;
    });

  async function sincronizar(topicoId: string) {
    if (emVoo.current.has(topicoId)) return; // a requisição em voo verá o novo desejo ao terminar
    emVoo.current.add(topicoId);
    try {
      while (desejados.current.get(topicoId) !== confirmados.current.has(topicoId)) {
        const alvo = desejados.current.get(topicoId)!;
        const ok = await fetch(`/api/planos/${planoId}/topicos/${encodeURIComponent(topicoId)}`, {
          method: alvo ? 'PUT' : 'DELETE',
        })
          .then((r) => r.ok)
          .catch(() => false);
        if (!ok) {
          const real = confirmados.current.has(topicoId);
          desejados.current.set(topicoId, real);
          aplicar(topicoId, real);
          setErro(MSG_FALHA);
          return;
        }
        if (alvo) confirmados.current.add(topicoId);
        else confirmados.current.delete(topicoId);
      }
    } finally {
      emVoo.current.delete(topicoId);
    }
  }

  function marcar(topicoId: string, nome: string, feito: boolean) {
    setErro(null);
    setAnuncio(feito ? `${nome}: marcado como concluído.` : `${nome}: desmarcado.`);
    desejados.current.set(topicoId, feito);
    aplicar(topicoId, feito);
    void sincronizar(topicoId);
  }

  return { concluidos, marcar, erro, anuncio };
}
