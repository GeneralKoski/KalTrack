import { I18n } from "i18n-js";

import it from "./locales/it.json";

// App a lingua singola (italiano): è un'app personale, l'inglese non serve.
// La struttura i18n resta perché reintrodurre una lingua costa poco - le chiavi
// esistono già tutte, va tradotto un solo file. Vedi CLAUDE.md.
export const i18n = new I18n({ it });

i18n.defaultLocale = "it";
i18n.locale = "it";
i18n.enableFallback = true;
