import { expect, type Page } from '@playwright/test';

const MAILPIT = 'http://127.0.0.1:54324';

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
