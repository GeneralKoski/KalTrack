import { normalizeText } from "@/src/domain/text";
import {
  OpenFoodFactsError,
  searchByName,
} from "@/src/services/openFoodFacts";
import type { FoodInput, FoodRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { useEffect, useRef, useState } from "react";

/**
 * Sotto questa lunghezza non si interroga l'archivio.
 *
 * "ri" restituisce mille prodotti che contengono "ri" e nessuno di essi e'
 * quel che si sta cercando: e' traffico su una domanda che non e' ancora una
 * domanda.
 */
const MIN_TERM_LENGTH = 3;

/** Quanti proporre. Piu' di cosi' e' una lista da scorrere, non una risposta. */
const OFF_LIMIT = 8;

interface OffSearch {
  results: FoodInput[];
  loading: boolean;
}

/**
 * I prodotti di OpenFoodFacts che completano la ricerca in libreria.
 *
 * L'archivio era raggiungibile **solo parlando**: l'unico chiamante di
 * `searchByName` era `src/ai/resolveFood.ts`, quindi tre milioni di prodotti
 * stavano dietro l'assistente vocale e chi cercava a dita vedeva solo SQLite -
 * cioe' i seed e quel che si era aggiunto a mano.
 *
 * Resta un complemento, non un sostituto: la libreria locale arriva subito e
 * senza rete, questo arriva dopo e puo' non arrivare. Per questo e' un hook a
 * parte invece di entrare in `searchFoods`, che e' local-first e deve restarlo.
 */
export function useOffSearch(term: string, locali: FoodRow[]): OffSearch {
  const [results, setResults] = useState<FoodInput[]>([]);
  const [loading, setLoading] = useState(false);
  /*
   * La risposta lenta di una ricerca precedente non deve sovrascrivere quella
   * corrente. Il cleanup dell'effetto non basta da solo: `setResults([])` a
   * ogni cambio di termine farebbe lampeggiare la sezione a ogni lettera.
   */
  const richiesta = useRef(0);

  const query = term.trim();

  useEffect(() => {
    if (query.length < MIN_TERM_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }

    const mia = ++richiesta.current;
    setLoading(true);

    void (async () => {
      try {
        const prodotti = await searchByName(query, OFF_LIMIT);
        if (richiesta.current === mia) setResults(prodotti);
      } catch (error) {
        // L'archivio non risponde: la libreria locale c'e' comunque e la
        // schermata non deve dire niente. Un errore che NON e' di OFF invece
        // e' un difetto nostro e va registrato come tale.
        if (error instanceof OpenFoodFactsError) {
          logger.warn("[off] ricerca non riuscita", error);
        } else {
          logger.error("[off] ricerca fallita", error);
        }
        if (richiesta.current === mia) setResults([]);
      } finally {
        if (richiesta.current === mia) setLoading(false);
      }
    })();
  }, [query]);

  return { results: escludiGiaPresenti(results, locali), loading };
}

/**
 * Toglie i prodotti che la libreria ha gia'.
 *
 * Due criteri, perche' due sono le vie con cui lo stesso prodotto puo' essere
 * gia' dentro: il codice a barre, che e' esatto, e il nome normalizzato, che
 * copre quel che e' stato aggiunto a mano senza codice. Senza, lo stesso
 * yogurt compariva due volte a due centimetri di distanza.
 */
export function escludiGiaPresenti(
  prodotti: FoodInput[],
  locali: FoodRow[],
): FoodInput[] {
  if (prodotti.length === 0) return prodotti;

  const barcode = new Set(
    locali.map((f) => f.barcode).filter((b): b is string => !!b),
  );
  const nomi = new Set(locali.map((f) => normalizeText(f.name)));

  return prodotti.filter((p) => {
    if (p.barcode && barcode.has(p.barcode)) return false;
    return !nomi.has(normalizeText(p.name));
  });
}
