import { ApiError, messageOf } from '@admin/api/errors';

interface CampoConErrori<Campo extends string> {
    name: Campo;
    errors: string[];
}

/**
 * Quel che serve di un `FormInstance<Valori>` di AntD 6 per scriverci sopra
 * gli errori del server - non l'interfaccia intera, solo `setFields`.
 *
 * E' un'interfaccia a se' e non `FormInstance<Valori>` importato da 'antd'
 * perche' il tipo vero di `setFields` e' `(fields: FieldData<Valori>[]) =>
 * void`, dove `FieldData<Valori>['name']` e' `DeepNamePath<Valori>` - un tipo
 * condizionale ricorsivo che, quando `Valori` e' un parametro generico non
 * ancora risolto (cioe' proprio il caso di una funzione che deve servire
 * moduli diversi), TypeScript non riesce a valutare: resta un tipo opaco a
 * cui nulla, a parte se stesso, risulta assegnabile - non e' una questione di
 * varianza dei parametri, e' che il compilatore non puo' decidere il ramo del
 * condizionale senza conoscere `Valori`. Restringendo la forma a
 * `{ name: Campo; errors: string[] }` il controllo si sposta a chi chiama,
 * dove `Valori` e' concreto (es. `FormInstance<Credenziali>`): li' TypeScript
 * verifica per davvero che ogni `Campo` passato sia una chiave che quel
 * modulo possiede, e un nome sbagliato o rimosso e' un errore di
 * compilazione, non un cast che lo nasconde.
 */
interface FormConCampi<Campo extends string> {
    setFields: (campi: CampoConErrori<Campo>[]) => void;
}

/**
 * Mette gli errori del server sotto i campi giusti di un modulo, e avvisa
 * sempre con il riassunto - anche quando il server non ha mandato dettagli
 * per campo, o l'errore non e' nemmeno un `ApiError`.
 *
 * `campi` va passato esplicitamente e non si ricava dal tipo del modulo: il
 * corpo `errors` del server e' un `Record<string, string[]>`, cioe' chiavi
 * che possono essere qualunque cosa il server abbia scritto (un refuso, un
 * campo tolto dal modulo ma non dal server). Si scorre percio' l'elenco dei
 * campi noti e si va a cercare l'errore di ciascuno - il contrario di
 * scorrere gli errori del server e provare a restringerli: cosi' un nome che
 * il modulo non ha non arriva mai vicino a `setFields`, e non serve una
 * guardia a runtime per scartarlo.
 */
export function applicaErroriServer<Campo extends string>(
    form: FormConCampi<Campo>,
    campi: readonly Campo[],
    error: unknown,
    avvisa: (messaggio: string) => void,
): void {
    if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
        const delModulo = campi
            .map((campo) => ({ name: campo, errors: error.errors[campo] ?? [] }))
            .filter((campo) => campo.errors.length > 0);

        if (delModulo.length > 0) {
            form.setFields(delModulo);
        }
    }

    avvisa(messageOf(error));
}
