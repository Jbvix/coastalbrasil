/**
 * Painel administrativo — cliente.
 * Autor: Jossian Brito (Charlie Bravo)
 * Versão 2.0.0 — 01/10/2026 · Etapa C3 do caminho C
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUAS ENCENAÇÕES ACABARAM AQUI
 *
 * 1 · O PORTÃO COMPARAVA O HASH NO NAVEGADOR  (aviso 9.4)
 *
 *     const esperado = (window.ADMIN_GATE_HASH || '').trim();
 *     if (!esperado) { this.createSession('Administrador', true); … }
 *     if (informado === esperado) { … }
 *
 *     O próprio arquivo já dizia o que era: "um trinco, não uma fechadura".
 *     Todo o painel é público; quem abrisse o console passava. E a primeira
 *     linha era pior que o resto: AMBIENTE SEM A VARIÁVEL ABRIA DIRETO.
 *
 *     Agora a senha vai para `/.netlify/functions/licenca`, onde é conferida
 *     com scrypt contra ADMIN_SENHA_HASH — variável que nunca chega ao
 *     navegador. E ambiente sem configuração passa a NEGAR: um deploy onde
 *     alguém esqueceu a variável não pode virar balcão público de emissão.
 *
 * 2 · O PAINEL EMITIA CHAVES QUE NÃO ABREM NADA
 *
 *     Ele gerava links `?token=…&user=…`. Desde a etapa C1 a vitrine não os
 *     lê mais — e nunca os validou de verdade. Era um gerador de chaves
 *     para uma porta que não existe.
 *
 *     Agora ele emite LICENÇA, que é o que a C2 definiu: por embarcação,
 *     com faixa de validade, guardada no banco como SHA-256.
 *
 * A SENHA FICA NA MEMÓRIA, NUNCA NO DISCO
 *
 * Enquanto a aba estiver aberta ela vive numa variável e viaja por HTTPS a
 * cada operação. Em `localStorage` sobreviveria ao fechar o navegador, ao
 * compartilhar o aparelho e a um XSS — e acabamos de tirar um XSS desta
 * mesma origem na C1. Fechou a aba, acabou a sessão. É menos cômodo e é o
 * certo para um painel usado algumas vezes por semana.
 * ══════════════════════════════════════════════════════════════════════════
 */

const LICENCA_URL = '/.netlify/functions/licenca';

class PainelAdmin {
    constructor() {
        /* Só memória. Nunca localStorage, nunca sessionStorage, nunca cookie. */
        this.senha = null;
        this.el = {};
    }

    ligar() {
        const g = (id) => document.getElementById(id);
        this.el = {
            hero: g('hero-section'), painel: g('dashboard-section'),
            formLogin: g('admin-login-form'), senha: g('admin-pass'),
            erroLogin: g('login-error'), quem: g('user-display'),
            vessel: g('lic-vessel'), faixa: g('lic-faixa'),
            devices: g('lic-devices'), contact: g('lic-contact'),
            emitir: g('lic-emitir'), resultado: g('lic-resultado'),
            token: g('lic-token'), resumoNota: g('lic-nota'),
            copiar: g('lic-copiar'), sair: g('admin-sair')
        };
        if (this.el.formLogin) {
            this.el.formLogin.addEventListener('submit', (ev) => { ev.preventDefault(); this.entrar(); });
        }
        if (this.el.emitir) this.el.emitir.addEventListener('click', () => this.emitirLicenca());
        if (this.el.copiar) this.el.copiar.addEventListener('click', () => this.copiarToken());
        if (this.el.sair) this.el.sair.addEventListener('click', () => this.sair());
    }

    /* Toda conversa com o servidor passa por aqui. A senha entra em TODA
       chamada porque não há sessão: sem cookie e sem token de sessão, não há
       o que roubar de um aparelho esquecido aberto. */
    async falar(corpo) {
        const r = await fetch(LICENCA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...corpo, senha: this.senha })
        });
        let j = {};
        try { j = await r.json(); } catch (e) { /* resposta sem corpo */ }
        return { status: r.status, ...j };
    }

    async entrar() {
        const digitada = (this.el.senha && this.el.senha.value) || '';
        this.mostrarErro('');
        if (!digitada) return this.mostrarErro('Digite a frase-senha.');

        this.senha = digitada;
        /* Uma emissão inválida de propósito serve de prova de senha: a função
           confere a senha ANTES de olhar a ação, então uma ação vazia volta
           400 quando a senha está certa e 401 quando está errada. Assim não
           é preciso um endpoint só para "entrar". */
        const r = await this.falar({ acao: '' });

        if (r.status === 401) { this.senha = null; return this.mostrarErro('Frase-senha incorreta.'); }
        if (r.status === 429) { this.senha = null; return this.mostrarErro('Tentativas demais. Aguarde alguns minutos.'); }
        if (r.status === 503) { this.senha = null; return this.mostrarErro('Portão não configurado no servidor: ' + (r.motivo || '')); }
        if (r.status === 403) { this.senha = null; return this.mostrarErro('Chamada recusada pela origem.'); }

        /* 400 "ação desconhecida" significa senha ACEITA. */
        if (this.el.senha) this.el.senha.value = '';
        this.abrirPainel();
    }

    abrirPainel() {
        if (this.el.hero) this.el.hero.classList.add('hidden');
        if (this.el.painel) this.el.painel.classList.remove('hidden');
        if (this.el.quem) this.el.quem.textContent = 'Administrador';
    }

    sair() {
        this.senha = null;
        if (this.el.painel) this.el.painel.classList.add('hidden');
        if (this.el.hero) this.el.hero.classList.remove('hidden');
        if (this.el.resultado) this.el.resultado.classList.add('hidden');
        if (this.el.token) this.el.token.value = '';
    }

    async emitirLicenca() {
        const vessel = (this.el.vessel && this.el.vessel.value || '').trim();
        const faixa = (this.el.faixa && this.el.faixa.value) || '';
        const devices = Number((this.el.devices && this.el.devices.value) || 3);
        const contact = (this.el.contact && this.el.contact.value || '').trim();

        if (!vessel) return this.mostrarErro('Informe a embarcação.', true);
        this.mostrarErro('', true);

        const r = await this.falar({ acao: 'emitir', vessel, faixa, devices, contact });

        if (r.status === 401 || r.status === 429) { this.sair(); return this.mostrarErro('Sessão encerrada: ' + (r.motivo || '')); }
        if (!r.ok) return this.mostrarErro(r.motivo || `Falha (HTTP ${r.status}).`, true);

        /* O TOKEN APARECE UMA ÚNICA VEZ. O banco guarda só o SHA-256 dele e
           este painel não grava nada — não há como recuperá-lo depois. Dizer
           isso na tela não é formalidade: é o que evita o chamado de
           "perdi o código, me manda de novo" que não tem resposta. */
        if (this.el.token) this.el.token.value = r.token;
        if (this.el.resumoNota) {
            const vence = new Date(r.expires_at);
            this.el.resumoNota.textContent =
                `${r.vessel} · ${r.faixa} · vence ${vence.toLocaleString('pt-BR')} · ` +
                `${r.devices} aparelho(s). Copie agora: o código não pode ser recuperado depois.`;
        }
        if (this.el.resultado) this.el.resultado.classList.remove('hidden');
    }

    copiarToken() {
        const campo = this.el.token;
        if (!campo || !campo.value) return;
        campo.select();
        try {
            navigator.clipboard.writeText(campo.value);
            if (this.el.copiar) {
                const antes = this.el.copiar.textContent;
                this.el.copiar.textContent = 'Copiado';
                setTimeout(() => { this.el.copiar.textContent = antes; }, 1500);
            }
        } catch (e) {
            /* Sem área de transferência (contexto não seguro): o campo já
               está selecionado, e Ctrl+C resolve. Não há por que falhar. */
        }
    }

    /* textContent, NUNCA innerHTML. A mensagem pode vir do servidor, e a C1
       acabou de tirar um XSS desta mesma origem. */
    mostrarErro(texto, noPainel = false) {
        const alvo = noPainel ? this.el.resumoNota : this.el.erroLogin;
        if (!alvo) return;
        alvo.textContent = texto || '';
        if (!noPainel) alvo.style.display = texto ? 'block' : 'none';
    }
}

const painelAdmin = new PainelAdmin();
document.addEventListener('DOMContentLoaded', () => painelAdmin.ligar());
