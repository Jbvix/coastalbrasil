/**
 * Painel administrativo — gerador de links de acesso.
 *
 * AVISO DE PROJETO: este painel roda inteiramente no navegador e NÃO constitui
 * controle de acesso. A sessão fica no localStorage do próprio visitante e o
 * portão de entrada é um trinco de conveniência (ver login()). Não coloque aqui
 * nada que dependa de sigilo.
 *
 * Autenticação de verdade precisa acontecer no servidor. O aplicativo já tem
 * esse caminho montado para os links de acompanhamento em terra: a função
 * check_nav_share, no Supabase, valida token, revogação e expiração antes de
 * liberar a telemetria.
 */

class AccessManager {
    constructor() {
        this.params = new URLSearchParams(window.location.search);
        this.token = this.params.get('token');
        this.STORAGE_KEY_USED_TOKENS = 'coastal_admin_used_tokens';
        this.STORAGE_KEY_SESSION = 'coastal_admin_session';
        this.CONSTANTS = {
            EMAIL: 'jossiancosta@gmail.com',
            WHATSAPP: '5585997737230' // International format for Brazil
        };

        this.init();
    }

    init() {
        // DOM Elements
        this.elements = {
            hero: document.getElementById('hero-section'),
            loginModal: document.getElementById('login-modal'),
            dashboard: document.getElementById('dashboard-section'),
            errorScreen: document.getElementById('error-screen'),
            errorText: document.getElementById('error-text'),
            loginForm: document.getElementById('login-form'),
            usernameInput: document.getElementById('username'),
            userDisplay: document.getElementById('user-display'),
            // Generator Elements
            genUsername: document.getElementById('gen-username'),
            genResult: document.getElementById('gen-result'),
            genDisplay: document.getElementById('gen-url-display'),
            // Portão do painel (ver login(): é trinco, não fechadura)
            adminPass: document.getElementById('admin-pass'),
            loginError: document.getElementById('login-error')
        };

        // Attach event listeners
        if (this.elements.loginForm) {
            this.elements.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Check Access State
        this.checkState();
    }

    /**
     * Determines current view based on Token and Session state.
     */
    checkState() {
        // 1. Check Admin Session
        const session = this.getSession();
        if (session && session.isAdmin) {
            this.showDashboard('Administrador');
            return;
        }

        // 2. Default -> Show Hero with Login
        this.showHero();
    }

    /**
     * Portão do painel administrativo.
     *
     * ANTES: a senha estava escrita em texto claro neste arquivo, que é
     * servido a qualquer visitante. Qualquer pessoa que abrisse o código-fonte
     * lia a senha — e senhas costumam ser reaproveitadas em outros lugares.
     *
     * AGORA: o build publica apenas o SHA-256 da frase-senha, vindo da variável
     * de ambiente ADMIN_GATE_HASH (ver scripts/build-config.js). A senha em si
     * não existe no repositório.
     *
     * O QUE ISSO NÃO É: uma barreira de segurança. O hash está no cliente e é
     * atacável por dicionário; todo o código do painel é público. É um trinco,
     * não uma fechadura. Sem hash configurado, o painel abre direto e exibe o
     * aviso — melhor do que uma falsa sensação de proteção.
     *
     * Controle de acesso real exige validação no servidor. O app já faz isso
     * para os links de acompanhamento, pela função check_nav_share no Supabase;
     * o mesmo caminho serviria aqui.
     */
    async sha256Hex(texto) {
        const bytes = new TextEncoder().encode(texto);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async login() {
        const esperado = (window.ADMIN_GATE_HASH || '').trim().toLowerCase();

        if (!esperado) {
            this.createSession('Administrador', true);
            this.showDashboard('Administrador');
            return;
        }

        const pass = this.elements.adminPass.value;
        let informado = '';
        try {
            informado = await this.sha256Hex(pass);
        } catch (e) {
            // crypto.subtle exige contexto seguro (https ou localhost)
            this.elements.loginError.textContent =
                'Verificação indisponível: abra a página por HTTPS ou localhost.';
            this.elements.loginError.style.display = 'block';
            return;
        }

        if (informado === esperado) {
            this.createSession('Administrador', true);
            this.showDashboard('Administrador');
            this.elements.loginError.style.display = 'none';
        } else {
            this.elements.loginError.textContent = 'Frase-senha incorreta.';
            this.elements.loginError.style.display = 'block';
        }
    }

    /**
     * Simulation of Token Validation.
     * In a real app, this would verify signature with backend.
     * Here, checks if token is in 'used' list in localStorage.
     */
    isTokenValid(token) {
        if (!token || token.length < 5) return false;

        const usedTokens = JSON.parse(localStorage.getItem(this.STORAGE_KEY_USED_TOKENS) || '[]');
        return !usedTokens.includes(token);
    }

    /**
     * Marks a token as used to prevent re-entry.
     */
    burnToken(token) {
        const usedTokens = JSON.parse(localStorage.getItem(this.STORAGE_KEY_USED_TOKENS) || '[]');
        if (!usedTokens.includes(token)) {
            usedTokens.push(token);
            localStorage.setItem(this.STORAGE_KEY_USED_TOKENS, JSON.stringify(usedTokens));
        }
    }

    /**
     * Handles the username submission.
     */
    handleLogin(e) {
        e.preventDefault();
        const username = this.elements.usernameInput.value.trim();

        if (username && this.token) {
            // 1. Burn the token so it can't be used again
            this.burnToken(this.token);

            // 2. Create Session
            this.createSession(username);

            // 3. Update UI
            this.showDashboard(username);

            // 4. (Optional) Remove token from URL for cleanliness without reload
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    createSession(username, isAdmin = false) {
        const sessionData = {
            username: username,
            isAdmin: isAdmin,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem(this.STORAGE_KEY_SESSION, JSON.stringify(sessionData));
    }

    getSession() {
        const data = localStorage.getItem(this.STORAGE_KEY_SESSION);
        return data ? JSON.parse(data) : null;
    }

    logout() {
        localStorage.removeItem(this.STORAGE_KEY_SESSION);
        location.reload(); // Refresh to return to Hero
    }

    /**
     * Generator Tools
     */
    generateToken() {
        const username = this.elements.genUsername.value.trim();
        if (!username) {
            alert('Por favor, digite o nome do usuário.');
            return;
        }

        // Generate a pseudo-random token (8 chars)
        const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase();
        const token = `CN${randomStr}`;

        // Build URL relative to current origin, pointing to index.html
        const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', 'index.html');
        const fullUrl = `${baseUrl}?token=${token}&user=${encodeURIComponent(username)}`;

        // Display Result
        this.elements.genDisplay.value = fullUrl;
        this.elements.genResult.classList.remove('hidden');
    }

    copyLink() {
        const url = this.elements.genDisplay.value;
        const username = this.elements.genUsername.value;
        // Extract token from URL for display
        const tokenMatch = url.match(/token=([^&]*)/);
        const token = tokenMatch ? tokenMatch[1] : 'N/A';

        const message = `Olá ${username},\n\nSeu acesso ao Coastal Navigator foi aprovado.\n\n🔗 Link de Acesso: ${url}\n🔑 Token: ${token}\n\nClique no link para acessar.`;

        navigator.clipboard.writeText(message).then(() => {
            alert('Mensagem completa copiada para a área de transferência!');
        });
    }

    shareLink(method) {
        const url = this.elements.genDisplay.value;
        const username = this.elements.genUsername.value;
        const tokenMatch = url.match(/token=([^&]*)/);
        const token = tokenMatch ? tokenMatch[1] : 'N/A';

        const text = `Olá ${username},\n\nSeu acesso ao Coastal Navigator foi aprovado.\n\n🔗 Link de Acesso: ${url}\n🔑 Token: ${token}\n\nClique no link para acessar.`;
        const encodedMsg = encodeURIComponent(text);

        if (method === 'whatsapp') {
            window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
        }
    }

    /**
     * Request Access Action
     */
    requestAccess(method) {
        const subject = encodeURIComponent("Solicitação de Acesso Administrativo - Coastal Navigator");
        const body = encodeURIComponent("Olá, solicito um token de acesso administrativo para o sistema Coastal Navigator.");

        if (method === 'email') {
            window.location.href = `mailto:${this.CONSTANTS.EMAIL}?subject=${subject}&body=${body}`;
        } else if (method === 'whatsapp') {
            window.open(`https://wa.me/${this.CONSTANTS.WHATSAPP}?text=${body}`, '_blank');
        }
    }

    // --- VIEW MANAGERS ---

    showHero() {
        this.hideAll();
        this.elements.hero.classList.remove('hidden');
    }

    showLoginModal() {
        this.hideAll();
        // Keep hero visible behind modal for aesthetics? Or just deep blue bg?
        // Let's hide hero to focus attention, or keep it blurred.
        // Implementation: show modal on top of a dark background.
        // For simplicity with current CSS:
        this.elements.hero.classList.add('hidden');
        this.elements.loginModal.classList.remove('hidden');
    }

    showDashboard(username) {
        this.hideAll();
        this.elements.userDisplay.textContent = username;
        this.elements.dashboard.classList.remove('hidden');
    }

    showError(message) {
        this.hideAll();
        this.elements.errorText.textContent = message;
        this.elements.errorScreen.classList.remove('hidden');
    }

    hideAll() {
        this.elements.hero.classList.add('hidden');
        this.elements.loginModal.classList.add('hidden');
        this.elements.dashboard.classList.add('hidden');
        this.elements.errorScreen.classList.add('hidden');
    }
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    window.accessManager = new AccessManager();
});
