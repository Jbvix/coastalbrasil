/**
 * Gatekeeper
 * Handles access requests and token validation on the landing page (index.html).
 */

class Gatekeeper {
    constructor() {
        this.params = new URLSearchParams(window.location.search);
        this.token = this.params.get('token');
        this.username = this.params.get('user');

        this.STORAGE_KEY_USED_TOKENS = 'coastal_user_used_tokens';
        this.CONSTANTS = {
            EMAIL: 'jossiancosta@gmail.com',
            WHATSAPP: '5585997737230',
            APP_URL: 'https://coastalbrasil.netlify.app/coastal-navigator-brasil-v2-0-5.html'
        };

        this.init();
    }

    init() {
        // Run validation immediately if token is present
        if (this.token) {
            this.validateAndRedirect();
        }
    }

    /**
     * Validates the token and redirects to the main app if valid.
     */
    validateAndRedirect() {
        if (this.isTokenUsed(this.token)) {
            alert('Acesso Negado: Este link de acesso já foi utilizado ou expirou.');
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }

        // Token is valid (in this simulation, any new token is valid)
        // Burn it
        this.burnToken(this.token);

        // Welcome message (optional)
        const userMdg = this.username ? `Bem-vindo, ${decodeURIComponent(this.username)}!` : 'Acesso Autorizado!';

        // Create a visual feedback before redirect
        document.body.innerHTML = `
            <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0D1B2A;color:#E0E1DD;font-family:sans-serif;">
                <h1 style="color:#4CAF50;">${userMdg}</h1>
                <p>Redirecionando para o Coastal Navigator...</p>
                <div style="margin-top:20px;width:40px;height:40px;border:4px solid #FFA726;border-top:4px solid transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>
                <style>@keyframes spin {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>
            </div>
        `;

        // Redirect after short delay
        setTimeout(() => {
            window.location.href = this.CONSTANTS.APP_URL;
        }, 2000);
    }

    isTokenUsed(token) {
        const usedTokens = JSON.parse(localStorage.getItem(this.STORAGE_KEY_USED_TOKENS) || '[]');
        return usedTokens.includes(token);
    }

    burnToken(token) {
        const usedTokens = JSON.parse(localStorage.getItem(this.STORAGE_KEY_USED_TOKENS) || '[]');
        if (!usedTokens.includes(token)) {
            usedTokens.push(token);
            localStorage.setItem(this.STORAGE_KEY_USED_TOKENS, JSON.stringify(usedTokens));
        }
    }

    /**
     * Modal Management
     */
    requestAccess(method) {
        this.currentMethod = method;
        const modal = document.getElementById('request-modal');
        const emailGroup = document.getElementById('req-email-group');
        const emailInput = document.getElementById('req-email');

        // Reset form
        document.getElementById('request-form').reset();

        // Configure View
        if (method === 'email') {
            emailGroup.style.display = 'block';
            emailInput.setAttribute('required', 'true');
        } else {
            emailGroup.style.display = 'none';
            emailInput.removeAttribute('required');
        }

        modal.style.display = 'flex';
    }

    closeModal() {
        document.getElementById('request-modal').style.display = 'none';
    }

    submitRequest() {
        const name = document.getElementById('req-name').value.trim();
        const userEmail = document.getElementById('req-email').value.trim();

        if (!name) return;

        const subject = encodeURIComponent("Solicitação de Acesso - Coastal Navigator");

        // Message Body construction
        let bodyText = `Olá, meu nome é ${name}.`;
        if (this.currentMethod === 'email' && userEmail) {
            bodyText += ` Meu email é ${userEmail}.`;
        }
        bodyText += ` Solicito um link de acesso ao sistema Coastal Navigator.`;

        const body = encodeURIComponent(bodyText);

        if (this.currentMethod === 'email') {
            // Mailto: Opens user's email client
            window.location.href = `mailto:${this.CONSTANTS.EMAIL}?subject=${subject}&body=${body}`;
        } else if (this.currentMethod === 'whatsapp') {
            // WhatsApp: Sends to Admin
            window.open(`https://wa.me/${this.CONSTANTS.WHATSAPP}?text=${body}`, '_blank');
        }

        this.closeModal();
    }

    goToAdmin() {
        window.location.href = 'admin.html';
    }
}

// Initialize
const gatekeeper = new Gatekeeper();
