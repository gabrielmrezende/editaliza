import { useRef, useState } from 'react';

const MSG_FALHA = 'Não foi possível salvar a marcação. Confira sua internet e tente de novo.';

/**
 * Tópicos concluídos com gravação otimista e serializada por tópico: cliques rápidos
 * (marca/desmarca/marca) viram no máximo uma requisição em voo por tópico, e ao fim o servidor
 * fica com o último estado escolhido. Em falha, volta ao último estado confirmado.
 */
export function useMarcacoes(planoId: string, iniciais: string[]) {
  const [base, setBase] = useState(iniciais);
  const [concluidos, setConcluidos] = useState(() => new Set(iniciais));
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [ocupados, setOcupados] = useState(0); // tópicos com requisição em voo
  const confirmados = useRef(new Set(iniciais)); // estado conhecido no servidor
  const desejados = useRef(new Map<string, boolean>());
  const emVoo = useRef(new Set<string>());
  const refsDe = useRef(iniciais); // de que `base` os refs acima partiram

  // A página volta escondida pela Activity (ou o servidor manda dados novos): adota a lista do
  // servidor, mas só sem requisição em voo, para não desfazer uma gravação em andamento.
  if (iniciais !== base && ocupados === 0) {
    setBase(iniciais);
    setConcluidos(new Set(iniciais));
  }

  /** Antes de gravar: se a base mudou, os refs passam a partir dela (nada está em voo). */
  function alinharRefs() {
    if (refsDe.current === base) return;
    refsDe.current = base;
    confirmados.current = new Set(base);
    desejados.current.clear();
  }

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
    setOcupados(emVoo.current.size);
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
      setOcupados(emVoo.current.size);
    }
  }

  function marcar(topicoId: string, nome: string, feito: boolean) {
    alinharRefs();
    setErro(null);
    setAnuncio(feito ? `${nome}: marcado como concluído.` : `${nome}: desmarcado.`);
    desejados.current.set(topicoId, feito);
    aplicar(topicoId, feito);
    void sincronizar(topicoId);
  }

  return { concluidos, marcar, erro, anuncio };
}
