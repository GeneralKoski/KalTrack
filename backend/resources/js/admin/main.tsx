// Placeholder in attesa della Fase 2, che sostituisce QUESTO file per intero
// col pannello React vero. Serve solo perche' `npm run build` funzioni e
// `GET /admin` non risponda 500: senza, la Fase 1 finirebbe con una rotta
// che non si puo' distribuire.
const root = document.getElementById('admin-root');

if (root) {
    root.textContent = 'Pannello non ancora disponibile.';
}
