# La composizione di una voce del diario - Design

**Data:** 31 agosto 2026
**Stato:** **implementata il 31 agosto 2026**, per intero. Piano in
`docs/superpowers/plans/2026-08-31-composizione-per-voce.md`.

Due cose sono cambiate scrivendo, e la spec qui sotto le racconta ancora come
erano previste:

- l'ingresso alla modifica **non e' il tocco della voce** ma una riga in coda
  all'elenco degli ingredienti. Il tocco continua a cambiare le porzioni: sono
  due gesti su due quantita' diverse, e unirli avrebbe richiesto di rifare la
  modifica delle porzioni dentro il foglio;
- ricerca dell'alimento e creazione rapida sono **modalita' dello stesso
  foglio** e non fogli annidati: un bottom sheet dentro un modale su React
  Native e' fragile.

## Il problema

Aggiungi "Crepes di zucchine" al diario. Un giorno le fai con 160 g di
zucchine invece di 140, e un altro giorno le farcisci col salame invece del
prosciutto cotto. Oggi non puoi dirlo.

Non e' una funzione mancante, e' un dato che non esiste. Una voce da ricetta
memorizza `recipe_id`, le porzioni e una fotografia dei valori; gli ingredienti
stanno in `recipe_items`, che appartiene **alla ricetta** ed e' condivisa da
tutte le voci che la citano. Cambiare le zucchine di oggi significherebbe
cambiare anche tutte le crepes gia' mangiate.

## Cosa deve fare

1. Nel diario la voce resta **una e raggruppata**: "Crepes di zucchine" con i
   suoi valori, e sotto l'elenco degli ingredienti con le loro grammature.
2. Le grammature si modificano, e gli ingredienti si **aggiungono e togliono**:
   via il cotto, dentro il salame.
3. **La ricetta non si tocca mai**, e nessuna altra voce - passata o futura -
   cambia.
4. Dalla modifica si puo' **salvare la variante come ricetta nuova**.
5. Dalla modifica si puo' **creare un alimento** che in catalogo non c'e'.

## Dove vive il dato

Una colonna nuova su `meal_entries` (migrazione 10):

```sql
ALTER TABLE meal_entries ADD COLUMN components TEXT;
```

Dentro, JSON:

```json
{
  "edited": false,
  "items": [
    { "foodId": "…", "label": "Zucchine", "quantityG": 140, "per100": { "kcal": 17, … } }
  ]
}
```

### Perche' una colonna e non una tabella figlia

Perche' `CLAUDE.md` lo dice gia', a proposito degli ingredienti di una ricetta:
riscrivere in blocco cancellando e reinserendo con id nuovi **fa accumulare
duplicati sull'altro telefono**. La composizione di una voce si riscrive intera
a ogni modifica: e' esattamente quella trappola. Con un valore solo la trappola
non puo' esistere - non ci sono righe da riconciliare.

E perche' **una voce del diario e' gia' una fotografia**. I valori nutrizionali
sono congelati nella riga: se domani correggi le calorie delle zucchine, il
pranzo di ieri non cambia, e cosi' deve essere. Congelare anche la composizione
e' coerente; una tabella figlia con chiavi esterne verso alimenti vivi
direbbe il contrario.

Per questo `label` e `per100` sono **copiati** dentro l'elemento e non letti
dall'alimento: la voce sopravvive intatta a una rinomina o a una cancellazione
del suo ingrediente. `foodId` resta per sapere da dove veniva, e non e' la
fonte dei numeri.

Il costo accettato: non si potra' chiedere in SQL "quanto salame ho mangiato a
settembre". Nessuna schermata lo chiede oggi. Se un giorno servisse, questa
colonna si normalizza con una migrazione; il difetto dei duplicati, una volta
in produzione, si paga sui dati.

### La sincronizzazione non richiede niente

E' generica: `SELECT *` in uscita, e in entrata usa le colonne che la tabella
ha davvero. Una versione dell'app che non conosce `components` la ignora senza
fallire - c'e' un commento in `sync.ts` che lo dichiara. Niente da aggiungere a
`SYNCED_TABLES`, e `meal_entries` e' gia' in `BACKUP_TABLES`.

## La composizione e' piatta

Copiando dalla ricetta l'albero viene **appiattito** in un elenco di alimenti
con i grammi: nessuna sotto-ricetta.

Se le crepes contenessero una besciamella, conservando l'annidamento non
potresti togliere il cotto senza scendere di livello - e togliere il cotto e' il
caso d'uso. Il prezzo e' che dentro la voce si perde il raggruppamento "questa
parte era la besciamella".

## Le porzioni, e un difetto che si chiude

Oggi cambiare le porzioni di una voce da ricetta **rilegge la ricetta viva**
(`updateEntryQuantity` chiama `buildRecipeTree`). Quindi se modifichi la ricetta
e poi tocchi le porzioni di una voce di due settimane fa, quella voce si
aggiorna ai valori nuovi. Contraddice la fotografia, ed e' un difetto che
nessuno ha notato perche' serviva quella sequenza precisa.

Da qui in avanti, per una voce con `components`, cambiare le porzioni **riscala
la composizione della voce**: ogni elemento moltiplicato per il rapporto fra le
porzioni nuove e le vecchie. La ricetta non viene piu' interrogata.

I valori della voce sono sempre la somma dei suoi elementi. Le colonne
nutrizionali di `meal_entries` restano quel che sono - la fotografia - e si
ricalcolano a ogni modifica della composizione.

## Le voci che esistono gia'

Hanno `components` a NULL, e non si toccano: nel diario si disegnano come oggi,
senza elenco. Alla prima modifica la composizione si **materializza** dalla
ricetta, appiattita e scalata alle porzioni della voce.

Se la ricetta non esiste piu', la materializzazione non e' possibile: la voce
resta modificabile solo nelle porzioni, come adesso. Non e' un errore da
mostrare, e' il limite di un dato che non c'e'.

## Cosa si vede

### Nel diario

La voce da ricetta mostra una **freccia** che apre l'elenco degli ingredienti,
chiuso di serie: un pasto con tre ricette da sei ingredienti sarebbe un muro.
Ogni riga e' `label`, grammi, kcal. Solo lettura.

Se `edited` e' vero, accanto al nome compare **"modificata"**. Senza, guardi
"Crepes di zucchine", leggi il nome della ricetta e credi di vedere la ricetta
- mentre dentro c'e' il salame.

### Il foglio di modifica

Toccando la voce si apre `EntryCompositionSheet`, che sostituisce il
`QuantityPrompt` per le voci da ricetta con composizione:

- le porzioni in alto;
- l'elenco degli ingredienti con i grammi modificabili in linea e un cestino
  per riga;
- un "+" che apre la scelta di un alimento;
- il totale aggiornato sotto;
- due azioni: **Salva come nuova ricetta** e Conferma.

Il campo dei grammi di un ingrediente riusa `QuantityPrompt`, quindi le
scorciatoie delle porzioni ("1 vasetto = 125 g") funzionano anche qui, gratis.

### Salva come nuova ricetta

Crea una ricetta nuova con la composizione corrente e `servings` pari alle
porzioni della voce, cosi' i valori per porzione restano quelli che hai
mangiato. Chiede il nome, proposto come "Crepes di zucchine (variante)".

**Non ripunta la voce** alla ricetta nuova e non modifica l'originale: la voce
di oggi resta com'e', e la ricetta nuova serve da domani. Ripuntarla
riscriverebbe la storia per guadagnare niente.

### Crea un alimento da qui

Nella scelta dell'alimento, quando la ricerca non trova niente, una riga
**"Crea «salame piccante»"** apre un foglio minimo - nome, kcal e i tre macro
per 100 g - che salva un alimento `source: "user"` e lo aggiunge come
ingrediente.

E' un form ridotto e non `FoodFormScreen`: navigare a un'altra schermata
perderebbe la composizione in corso di modifica. Il form completo resta
raggiungibile da Alimenti come sempre.

## Come si divide il lavoro

**`src/domain/entryComposition.ts`**, puro e testato, e' dove sta il rischio:

- appiattire un albero di ricetta in elementi, scalati alle porzioni;
- i valori di un elemento ai suoi grammi, e il totale della composizione;
- modificare, aggiungere, togliere, e quando `edited` diventa vero;
- riscalare tutti gli elementi al cambio di porzioni.

**`src/db/queries/diary.ts`**: leggere e scrivere `components` (JSON invalido =
NULL, mai un'eccezione a schermo), ricalcolare la fotografia, e
`updateEntryQuantity` che per queste voci non interroga piu' la ricetta.

**`src/containers/diary/`**: l'elenco apribile in `EntryRow`,
`EntryCompositionSheet`, il foglio minimo dell'alimento nuovo.

## Cosa non e' in questo lavoro

- **Le voci da alimento e le voci libere non hanno composizione.** Un alimento
  non ha ingredienti, e una voce libera e' un totale per definizione.
- **Nessun raggruppamento delle sotto-ricette** dentro la voce: vedi sopra.
- **Nessuna statistica per ingrediente.** E' il costo dichiarato della colonna
  JSON.
- **La ricetta non impara.** Se ogni volta metti 160 g di zucchine, l'app non
  te lo propone e non chiede se aggiornare la ricetta. Sarebbe un'altra
  funzione, e va decisa a parte.
