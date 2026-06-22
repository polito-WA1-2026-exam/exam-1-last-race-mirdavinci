const BASE_URL = 'http://localhost:3001/api';

async function request(url, options = {}) {
    // Ensure session cookies are bundled with every HTTP transaction
    options.credentials = 'include'; 
    if (options.body && typeof options.body === 'object') {
        options.headers = {
            ...options.headers,
            'Content-Type': 'application/json',
        };
        options.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${BASE_URL}${url}`, options);
    
    // ERROR HANDLING INTERCEPTOR
    if (!response.ok) {
        // If Passport throws a 401, intercept it immediately
        if (response.status === 401) {
            throw new Error('Wrong username or password.');
        }

        // Otherwise, try to parse the JSON error from the backend
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Network request failed.');
    }
    
    if (response.status === 204 || response.headers.get('content-length') === '0') {
        return null;
    }
    return response.json();
}

export const API = {
    login: (username, password) => request('/login', { method: 'POST', body: { username, password } }),
    logout: () => request('/logout', { method: 'DELETE' }),
    checkSession: () => request('/session', { method: 'GET' }),
    getRankings: () => request('/rankings', { method: 'GET' }),
    getNetwork: () => request('/network', { method: 'GET' }),
    startGame: () => request('/game/start', { method: 'POST' }),
    submitRoute: (route, startStation, destStation) => 
        request('/game/submit', { method: 'POST', body: { route, startStation, destStation } }),
};