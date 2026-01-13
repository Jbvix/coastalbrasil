/**
 * Admin Access Manager
 * Handles simulation of token-based authentication, request routing, and session state.
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
            genDisplay: document.getElementById('gen-url-display')
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
        // 1. Check if user already has an active session
        const session = this.getSession();
        if (session) {
            this.showDashboard(session.username);
            return;
        }

        // 2. Check if a token is present in URL
        if (this.token) {
            if (this.isTokenValid(this.token)) {
                // Token is valid and unused -> Show Login Modal
                this.showLoginModal();
            } else {
                // Token is invalid or used -> Show Error
                this.showError('Este link de acesso é inválido ou já foi utilizado.');
            }
        } else {
            // 3. No token, no session -> Show Hero (Default)
            this.showHero();
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

    createSession(username) {
        const sessionData = {
            username: username,
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
