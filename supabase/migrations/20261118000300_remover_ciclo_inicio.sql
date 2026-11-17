-- A posição da fila (fila_posicao/fila_desde) substituiu ciclo_inicio; ninguém mais lê nem escreve a coluna.
alter table public.planos drop column ciclo_inicio;
