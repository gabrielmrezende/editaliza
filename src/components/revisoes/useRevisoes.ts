import { useRef, useState } from 'react';
import type { Revisao } from '@/lib/dominio/acompanhamento';

const MSG_FALHA = 'Não foi possível salvar a alteração. Confira sua internet e tente de novo.';

/**
 * Revisões com gravação otimista e serializada por revisão: no máximo uma requisição em voo por
 * revisão, e ao fim o servidor fica com o último estado escolhido. Em falha, volta ao último estado
 * confirmado (e mostra o motivo, se o servidor deu um).
 */
export function useRevisoes(iniciais: Revisao[]) {
  const [base, setBase] = useState(iniciais);
  const [revisoes, setRevisoes] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [ocupadas, setOcupadas] = useState(0); // revisões com requisição em voo
  const confirmadas = useRef(new Map(iniciais.map((r) => [r.id, r.concluidaEm])));
  const desejadas = useRef(new Map<string, boolean>());
  const excluidas = useRef(new Map<string, Revisao>()); // exclusões pedidas, para restaurar se falhar
  const emVoo = useRef(new Set<string>());
  const refsDe = useRef(iniciais); // de que `base` os refs acima partiram

  // A página volta escondida pela Activity (ou o servidor manda dados novos): adota a lista do
  // servidor, mas só sem requisição em voo, para não desfazer uma gravação em andamento.
  if (iniciais !== base && ocupadas === 0) {
    setBase(iniciais);
    setRevisoes(iniciais);
  }

  /** Antes de gravar: se a base mudou, os refs passam a partir dela (nada está em voo). */
  function alinharRefs() {
    if (refsDe.current === base) return;
    refsDe.current = base;
    confirmadas.current = new Map(base.map((r) => [r.id, r.concluidaEm]));
    desejadas.current.clear();
    excluidas.current.clear();
  }

  const trocar = (id: string, concluidaEm: string | null) =>
    setRevisoes((atual) => atual.map((r) => (r.id === id ? { ...r, concluidaEm } : r)));

  async function chamar(id: string, init: RequestInit): Promise<{ ok: boolean; erro?: string }> {
    try {
      const r = await fetch(`/api/revisoes/${encodeURIComponent(id)}`, {
        ...init,
        headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      });
      if (r.ok) return { ok: true };
      const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
      return { ok: false, erro: corpo?.erro };
    } catch {
      return { ok: false };
    }
  }

  async function sincronizar(id: string) {
    if (emVoo.current.has(id)) return; // a requisição em voo verá o novo desejo ao terminar
    emVoo.current.add(id);
    setOcupadas(emVoo.current.size);
    try {
      for (;;) {
        const apagar = excluidas.current.get(id);
        if (apagar) {
          const res = await chamar(id, { method: 'DELETE' });
          if (res.ok) return;
          excluidas.current.delete(id);
          setRevisoes((atual) => (atual.some((r) => r.id === id) ? atual : [...atual, apagar]));
          setErro(res.erro ?? MSG_FALHA);
          return;
        }
        const alvo = desejadas.current.get(id);
        const confirmada = confirmadas.current.get(id) ?? null;
        if (alvo === undefined || alvo === (confirmada !== null)) return;
        const res = await chamar(id, { method: 'PATCH', body: JSON.stringify({ concluida: alvo }) });
        if (!res.ok) {
          desejadas.current.set(id, confirmada !== null);
          trocar(id, confirmada);
          setErro(res.erro ?? MSG_FALHA);
          // Uma exclusão pedida enquanto esta marcação estava em voo ainda precisa ser enviada.
          if (excluidas.current.has(id)) continue;
          return;
        }
        confirmadas.current.set(id, alvo ? new Date().toISOString() : null);
      }
    } finally {
      emVoo.current.delete(id);
      setOcupadas(emVoo.current.size);
    }
  }

  function concluir(id: string, concluida: boolean) {
    alinharRefs();
    const r = revisoes.find((x) => x.id === id);
    if (!r) return;
    setErro(null);
    setAnuncio(concluida ? `${r.topicoNome}: revisão concluída.` : `${r.topicoNome}: revisão voltou para pendente.`);
    desejadas.current.set(id, concluida);
    trocar(id, concluida ? (confirmadas.current.get(id) ?? new Date().toISOString()) : null);
    void sincronizar(id);
  }

  function excluir(id: string) {
    alinharRefs();
    const r = revisoes.find((x) => x.id === id);
    if (!r) return;
    setErro(null);
    setAnuncio(`${r.topicoNome}: revisão excluída.`);
    excluidas.current.set(id, { ...r, concluidaEm: confirmadas.current.get(id) ?? null });
    setRevisoes((atual) => atual.filter((x) => x.id !== id));
    void sincronizar(id);
  }

  return { revisoes, concluir, excluir, erro, anuncio };
}
