/** Chave do localStorage com a escolha do aluno: 'light' | 'dark'. */
export const CHAVE_TEMA = 'editaliza:tema';

/**
 * Roda no <head>, antes da primeira pintura: aplica data-theme em <html> a partir da escolha
 * salva ou, na falta dela, de prefers-color-scheme. Tudo em try/catch (localStorage pode falhar).
 */
export const SCRIPT_TEMA = `(function(){try{var t=null;try{t=localStorage.getItem("${CHAVE_TEMA}")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
