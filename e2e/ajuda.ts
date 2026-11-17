import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const MAILPIT = 'http://127.0.0.1:54324';
const PDF = path.join(__dirname, '..', 'tests', 'fixtures', 'edital-exemplo.pdf');

type Mensagem = { ID: string; To: { Address: string }[] };

/** Espera o e-mail de login no Mailpit local e devolve o link mágico. */
async function lerLinkMagico(email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const lista = await fetch(`${MAILPIT}/api/v1/messages`).then((r) => r.json());
        const msg = (lista.messages as Mensagem[]).find((m) =>
          m.To.some((d) => d.Address.toLowerCase() === email.toLowerCase()),
        );
        if (!msg) return false;
        const corpo = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
        const achado = /https?:\/\/[^\s"<>]*\/auth\/v1\/verify[^\s"<>]*/.exec(
          `${corpo.Text ?? ''}\n${corpo.HTML ?? ''}`,
        );
        link = achado?.[0].replace(/&amp;/g, '&');
        return Boolean(link);
      },
      { message: `e-mail de login para ${email} não chegou`, timeout: 15_000 },
    )
    .toBe(true);
  return link!;
}

/** Faz login por link mágico (lido no Mailpit) e termina logado. */
export async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Receber link por e-mail' }).click();
  await expect(page.getByText('Enviamos um link')).toBeVisible();
  await page.goto(await lerLinkMagico(email));
  await page.waitForURL(/\/app(\/|$)/);
}

/** Data (aaaa-mm-dd) em São Paulo daqui a `dias` dias. */
export function dataDaquiA(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

export async function continuar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Continuar' }).click();
}

/** Login (usuário novo) → envio do PDF → Cargo A → tela de revisão do conteúdo. */
export async function ateRevisao(page: Page, prefixo = 'onboarding'): Promise<void> {
  await entrar(page, `${prefixo}-${randomUUID()}@teste.local`);
  await expect(page).toHaveURL(/\/app\/novo$/);
  await page.getByLabel('PDF do edital').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Ler edital' }).click();
  await page.getByRole('button', { name: 'Cargo A' }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Confira o conteúdo' })).toBeVisible({ timeout: 30_000 });
}

/**
 * Usuário novo com um plano ativo (Cargo A, horas e níveis padrão). `dataProva` ausente = daqui a
 * 90 dias; `null` = "a data ainda não saiu" (ciclo).
 */
export async function criarPlano(
  page: Page,
  { dataProva = dataDaquiA(90), prefixo = 'plano' }: { dataProva?: string | null; prefixo?: string } = {},
): Promise<void> {
  await ateRevisao(page, prefixo);
  await continuar(page);
  await expect(page.getByRole('heading', { name: 'Quando é a prova?' })).toBeVisible();
  if (dataProva === null) await page.getByLabel('A data ainda não saiu').check();
  else await page.getByLabel('Data da prova').fill(dataProva);
  await continuar(page);
  await expect(page.getByRole('heading', { name: 'Quanto tempo você tem?' })).toBeVisible();
  await continuar(page);
  await expect(page.getByRole('heading', { name: 'Qual é o seu nível?' })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar meu plano' }).click();
  await page.waitForURL(/\/app\/plano$/);
}
