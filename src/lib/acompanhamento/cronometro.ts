import { z } from 'zod';
import { INTERVALOS_REVISAO } from '@/lib/dominio/acompanhamento';

// Regras puras do cronômetro de estudo. Nada aqui lê o relógio: quem chama passa `agora` (ms).

export interface EstadoCronometro {
  rodando: boolean;
  iniciadoEm: number | null;
  acumuladoSeg: number;
}

export const PARADO: EstadoCronometro = { rodando: false, iniciadoEm: null, acumuladoSeg: 0 };

/** Acima disso o cronômetro provavelmente foi esquecido ligado. */
export const ESQUECIDO_SEG = 6 * 3600;

const MAX_MINUTOS = 1440;
const TOLERANCIA_FUTURO_MS = 60_000;
const INTERVALOS_VALIDOS: readonly number[] = INTERVALOS_REVISAO;

function decorridoSeg(iniciadoEm: number, agora: number): number {
  return Math.max(0, Math.floor((agora - iniciadoEm) / 1000));
}

/** Inicia ou retoma; se já está rodando, não reinicia. */
export function iniciar(e: EstadoCronometro, agora: number): EstadoCronometro {
  if (e.rodando) return e;
  return { rodando: true, iniciadoEm: agora, acumuladoSeg: e.acumuladoSeg };
}

export function pausar(e: EstadoCronometro, agora: number): EstadoCronometro {
  if (!e.rodando || e.iniciadoEm === null) return e;
  return {
    rodando: false,
    iniciadoEm: null,
    acumuladoSeg: e.acumuladoSeg + decorridoSeg(e.iniciadoEm, agora),
  };
}

export function segundosDecorridos(e: EstadoCronometro, agora: number): number {
  if (!e.rodando || e.iniciadoEm === null) return e.acumuladoSeg;
  return e.acumuladoSeg + decorridoSeg(e.iniciadoEm, agora);
}

export function minutosParaRegistro(segundos: number): number {
  return Math.min(MAX_MINUTOS, Math.round(segundos / 60));
}

export interface FormularioRascunho {
  disciplinaId: string | null;
  topicoId: string | null;
  tipo: string | null;
  acertos: string;
  erros: string;
  observacao: string;
  intervalos: number[];
  concluir: boolean;
}

export interface Rascunho {
  versao: 1;
  estado: EstadoCronometro;
  formulario: FormularioRascunho;
  atualizadoEm: number;
}

export function chaveRascunho(userId: string): string {
  return `editaliza:cronometro:${userId}`;
}

// Em Zod 4, z.number() já recusa NaN e ±Infinity (`.finite()` é um no-op obsoleto).
const EsquemaRascunho = z.object({
  versao: z.literal(1),
  estado: z.object({
    rodando: z.boolean(),
    iniciadoEm: z.number().int().nullable(),
    acumuladoSeg: z.number().int().min(0),
  }),
  formulario: z.object({
    disciplinaId: z.string().nullable(),
    topicoId: z.string().nullable(),
    tipo: z.string().nullable(),
    acertos: z.string(),
    erros: z.string(),
    observacao: z.string(),
    intervalos: z
      .array(z.number().refine((n) => INTERVALOS_VALIDOS.includes(n)))
      .transform((v) => [...new Set(v)]),
    concluir: z.boolean(),
  }),
  atualizadoEm: z.number().int(),
});

/** Devolve o rascunho se for coerente e útil de restaurar; senão null. */
export function validarRascunho(valor: unknown, agora: number): Rascunho | null {
  const r = EsquemaRascunho.safeParse(valor);
  if (!r.success) return null;
  const { estado } = r.data;
  if (estado.rodando) {
    if (estado.iniciadoEm === null || estado.iniciadoEm > agora + TOLERANCIA_FUTURO_MS) return null;
  } else if (estado.iniciadoEm !== null || estado.acumuladoSeg === 0) {
    return null;
  }
  return r.data;
}
