/**
 * Contato da vitrine (index.html).
 * Autor: Jossian Brito (Charlie Bravo)
 * Versão 2.0.0 — 01/10/2026 · Etapa C1 do controle de acesso
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO ERA, E POR QUE DEIXOU DE SER
 *
 * Até a v2.16.0 isto se chamava Gatekeeper e fingia ser um portão. Fingia
 * em três níveis, do mais inofensivo ao grave:
 *
 *  1. NÃO VALIDAVA NADA. `validateAndRedirect()` aceitava qualquer `?token=`
 *     ainda não usado NAQUELE navegador. Sem assinatura, sem servidor. A
 *     lista de usados morava no localStorage do próprio visitante, que a
 *     apagava quando quisesse — ou abria uma aba anônima.
 *
 *  2. NÃO GUARDAVA COISA ALGUMA. `app.html` é um endereço público e nunca
 *     consultou este arquivo. Quem digitasse /app.html entrava. O token
 *     decorava o caminho; não trancava porta nenhuma.
 *
 *  3. ABRIA UM BURACO DE VERDADE. O parâmetro `?user=` ia DIRETO para
 *     `innerHTML`:
 *
 *         const userMdg = `Bem-vindo, ${decodeURIComponent(this.username)}!`;
 *         document.body.innerHTML = `…<h1>${userMdg}</h1>…`;
 *
 *     Medido em Chromium: `?user=<img src=x onerror=alert(1)>` EXECUTOU.
 *     Era injeção de script na origem do aplicativo — a mesma origem que
 *     guarda a derrota no localStorage e fala com o Supabase.
 *
 *     E o pior não é a falha, é o VETOR: a página ensinava o usuário a
 *     esperar justamente links `?token=…&user=…` chegando por WhatsApp. O
 *     ritual de acesso do produto era o veículo de entrega do ataque.
 *
 * O CAMINHO C, decidido em 01/10/2026: a carta fica aberta e cobra-se pelo
 * que roda em servidor e custa (previsão de tempo e espelhamento). Logo não
 * há portão na vitrine a defender — e um portão de mentira é pior que
 * nenhum, porque a pessoa honesta espera o link e a outra digita o endereço.
 *
 * Sobrou o que é verdade: um jeito de falar com o autor.
 * ══════════════════════════════════════════════════════════════════════════
 */

class ContatoVitrine {
    constructor() {
        this.CONSTANTS = {
            EMAIL: 'jossiancosta@gmail.com',
            WHATSAPP: '5585997737230',
            APP_URL: './app.html'
        };
        this.metodo = 'whatsapp';
        this.limparLinkAntigo();
    }

    /**
     * Links antigos (?token=…&user=…) continuam circulando por aí — em
     * conversas de WhatsApp, em capturas de tela. Eles não devem quebrar nem
     * assustar: a pessoa chega na vitrine normalmente.
     *
     * Os parâmetros são APAGADOS da barra de endereço sem nunca serem lidos
     * para dentro da página. Não há leitura, não há `innerHTML`, não há
     * decodeURIComponent de nada vindo da URL — a classe inteira de injeção
     * some junto com o código que a criava.
     *
     * `replaceState` e não `assign`: troca o endereço sem recarregar e sem
     * empilhar uma entrada no histórico, para o botão "voltar" não devolver
     * o visitante ao link antigo.
     */
    limparLinkAntigo() {
        try {
            const u = new URL(window.location.href);
            if (!u.searchParams.has('token') && !u.searchParams.has('user')) return;
            u.searchParams.delete('token');
            u.searchParams.delete('user');
            window.history.replaceState({}, document.title, u.pathname + u.search + u.hash);
        } catch (e) {
            /* URL exótica: não é motivo para derrubar a página. */
        }
    }

    abrirAplicativo() {
        window.location.href = this.CONSTANTS.APP_URL;
    }

    /* ── Janela de contato ────────────────────────────────────────────── */

    abrirContato(metodo) {
        this.metodo = metodo === 'email' ? 'email' : 'whatsapp';
        const janela = document.getElementById('contato-modal');
        const grupoEmail = document.getElementById('cont-email-group');
        const campoEmail = document.getElementById('cont-email');
        const form = document.getElementById('contato-form');
        if (!janela || !form) return;

        form.reset();
        // No WhatsApp a conversa já identifica quem fala; pedir e-mail ali é
        // atrito sem ganho. Por e-mail, o endereço é como se responde.
        if (this.metodo === 'email') {
            grupoEmail.style.display = 'block';
            campoEmail.setAttribute('required', 'true');
        } else {
            grupoEmail.style.display = 'none';
            campoEmail.removeAttribute('required');
        }
        janela.style.display = 'flex';
    }

    fecharContato() {
        const janela = document.getElementById('contato-modal');
        if (janela) janela.style.display = 'none';
    }

    enviarContato() {
        const nome = (document.getElementById('cont-nome') || {}).value || '';
        const email = (document.getElementById('cont-email') || {}).value || '';
        const assuntoLivre = (document.getElementById('cont-assunto') || {}).value || '';
        if (!nome.trim()) return;

        /* A mensagem não pede mais "um link de acesso", porque não existe
           link de acesso. Diz o que é verdade: alguém quer falar. */
        let corpo = `Olá, meu nome é ${nome.trim()}.`;
        if (this.metodo === 'email' && email.trim()) corpo += ` Meu e-mail é ${email.trim()}.`;
        corpo += assuntoLivre.trim()
            ? ` ${assuntoLivre.trim()}`
            : ' Vim pelo Coastal Navigator Brasil e gostaria de falar com você.';

        if (this.metodo === 'email') {
            const assunto = encodeURIComponent('Coastal Navigator Brasil — contato');
            window.location.href =
                `mailto:${this.CONSTANTS.EMAIL}?subject=${assunto}&body=${encodeURIComponent(corpo)}`;
        } else {
            window.open(`https://wa.me/${this.CONSTANTS.WHATSAPP}?text=${encodeURIComponent(corpo)}`,
                        '_blank', 'noopener');
        }
        this.fecharContato();
    }

    irParaAdmin() {
        window.location.href = 'admin.html';
    }
}

const contato = new ContatoVitrine();

/* LIGAÇÃO POR addEventListener, NUNCA POR onclick=.
   O aviso 9.7 conta 58 atributos `onclick=` inline, que são o que obriga a
   CSP a aceitar 'unsafe-inline'. Código novo não aumenta a dívida — e aqui
   ela DIMINUI, porque os botões que esta etapa toca deixam de usar onclick. */
document.addEventListener('DOMContentLoaded', () => {
    const ligar = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    };
    ligar('btn-abrir-app', () => contato.abrirAplicativo());
    ligar('btn-contato-whatsapp', () => contato.abrirContato('whatsapp'));
    ligar('btn-contato-email', () => contato.abrirContato('email'));
    ligar('btn-contato-cancelar', () => contato.fecharContato());

    const form = document.getElementById('contato-form');
    if (form) form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        contato.enviarContato();
    });
});
