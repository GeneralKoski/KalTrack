{{--
    La pagina dove atterra il collegamento della mail di recupero.

    E' l'unica pagina pubblica di questo server oltre al benvenuto, ed e'
    scritta a mano invece che con il pannello: la SPA di `/admin` sta dietro un
    accesso, e chi arriva qui non ha una password - e' esattamente il motivo
    per cui e' arrivato. Nessun Vite, nessun React: un modulo e venti righe di
    JavaScript non hanno bisogno di un bundle, e una pagina di recupero che
    dipende da un asset compilato e' una pagina che si rompe il giorno del
    deploy sbagliato.

    Il modulo chiama `POST /api/password/reset`, cioe' lo STESSO endpoint che
    userebbe l'app: la logica del recupero sta in un posto solo, e questa
    pagina ne e' un consumatore come un altro. Un `<form>` HTML nudo verso
    quella rotta risponderebbe con del JSON a schermo.
--}}
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>KalTrack - Nuova password</title>
    <style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #18181b;
            color: #fafafa;
            font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .scheda { width: 100%; max-width: 380px; }
        h1 { font-size: 22px; margin: 0 0 8px; }
        p.aiuto { color: #a1a1aa; margin: 0 0 24px; }
        label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
        input {
            width: 100%;
            height: 44px;
            padding: 0 12px;
            margin-bottom: 16px;
            border: 1px solid #3f3f46;
            border-radius: 8px;
            background: #27272a;
            color: #fafafa;
            font-size: 15px;
        }
        button {
            width: 100%;
            height: 44px;
            border: 0;
            border-radius: 8px;
            background: #22c55e;
            color: #052e16;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
        }
        button[disabled] { opacity: .6; cursor: default; }
        .esito { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 14px; }
        .esito.male { background: #450a0a; color: #fecaca; }
        .esito.bene { background: #052e16; color: #bbf7d0; }
        [hidden] { display: none !important; }
    </style>
</head>
<body>
    <div class="scheda">
        <h1>Nuova password</h1>
        <p class="aiuto">Per <strong>{{ $email }}</strong>. Il collegamento vale un'ora e una volta sola.</p>

        <form id="modulo">
            <label for="password">Password</label>
            <input id="password" type="password" autocomplete="new-password" minlength="8" maxlength="72" required>

            <label for="conferma">Ripetila</label>
            <input id="conferma" type="password" autocomplete="new-password" minlength="8" maxlength="72" required>

            <button type="submit" id="invia">Salva</button>
        </form>

        <div class="esito" id="esito" hidden></div>
    </div>

    <script>
        const modulo = document.getElementById('modulo');
        const invia = document.getElementById('invia');
        const esito = document.getElementById('esito');

        const dici = (testo, bene) => {
            esito.textContent = testo;
            esito.className = 'esito ' + (bene ? 'bene' : 'male');
            esito.hidden = false;
        };

        modulo.addEventListener('submit', async (evento) => {
            evento.preventDefault();

            const password = document.getElementById('password').value;

            // Le due password si confrontano QUI e non sul server: e' l'unico
            // controllo che riguarda solo questo modulo - il server riceve una
            // password sola, e non ha modo di sapere che chi la scriveva ne
            // aveva in mente un'altra.
            if (password !== document.getElementById('conferma').value) {
                dici('Le due password non combaciano.', false);
                return;
            }

            invia.disabled = true;
            esito.hidden = true;

            try {
                const risposta = await fetch('/api/password/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({
                        token: @json($token),
                        email: @json($email),
                        password: password,
                    }),
                });
                const corpo = await risposta.json().catch(() => ({}));

                if (!risposta.ok) {
                    dici(corpo.message || 'Non è andata. Riprova.', false);
                    invia.disabled = false;
                    return;
                }

                // Il modulo sparisce a cose fatte: il token e' speso, e
                // lasciarlo premibile inviterebbe a un secondo tentativo che
                // risponderebbe "collegamento non piu' valido" a chi ha appena
                // avuto successo.
                modulo.hidden = true;
                dici('Password aggiornata. Ora puoi accedere dall\'app.', true);
            } catch (errore) {
                dici('Non si è riusciti a parlare col server.', false);
                invia.disabled = false;
            }
        });
    </script>
</body>
</html>
