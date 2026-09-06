import type { Equipment, MuscleGroup } from "@/src/types/gym";

export interface SeedExercise {
  /** Id stabile: permette di riconoscere il seed già inserito. */
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment[];
  /**
   * Come si esegue, una riga.
   *
   * **Obbligatoria**, e non lo era: 128 dei 200 esercizi ne erano sprovvisti,
   * e la schermata di dettaglio rispondeva "Nessuna descrizione" a chi
   * chiedeva come si fa. Richiederla qui e' il modo perche' il prossimo
   * esercizio aggiunto non possa entrare muto.
   */
  instructions: string;
}

export const SEED_EXERCISES: SeedExercise[] = [
  // Petto
  {
    id: "ex-panca-piana-bilanciere",
    name: "Panca piana con bilanciere",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti", "spalle"],
    equipment: ["bilanciere", "panca"],
    instructions:
      "Scapole addotte e depresse per tutta la serie, il bilanciere scende all'altezza dei capezzoli.",
  },
  {
    id: "ex-panca-inclinata-bilanciere",
    name: "Panca inclinata con bilanciere",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle", "tricipiti"],
    equipment: ["bilanciere", "panca"],
    instructions:
      "Inclinazione 30-45 gradi: oltre i 45 il lavoro si sposta quasi tutto sulle spalle.",
  },
  {
    id: "ex-panca-declinata-bilanciere",
    name: "Panca declinata con bilanciere",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti"],
    equipment: ["bilanciere", "panca"],
    instructions:
      "Declino di 15-20 gradi e bilanciere che scende sotto i capezzoli: e' la variante che chiede meno alle spalle.",
  },
  {
    id: "ex-panca-piana-manubri",
    name: "Panca piana con manubri",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti", "spalle"],
    equipment: ["manubri", "panca"],
    instructions:
      "Scendi finché i gomiti superano di poco la linea del busto, senza far toccare i manubri in alto.",
  },
  {
    id: "ex-panca-inclinata-manubri",
    name: "Panca inclinata con manubri",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle", "tricipiti"],
    equipment: ["manubri", "panca"],
    instructions:
      "I manubri scendono all'altezza delle clavicole e in alto non si toccano: l'ultimo tratto sarebbe tutto tricipite.",
  },
  {
    id: "ex-panca-declinata-manubri",
    name: "Panca declinata con manubri",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti"],
    equipment: ["manubri", "panca"],
    instructions:
      "Blocca i piedi prima di prendere i manubri: da declinato non c'e' modo di sistemarsi dopo.",
  },
  {
    id: "ex-croci-panca-piana-manubri",
    name: "Croci su panca piana con manubri",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle"],
    equipment: ["manubri", "panca"],
    instructions:
      "Gomiti semi-piegati e angolo fisso: se si aprono e chiudono stai facendo una distensione.",
  },
  {
    id: "ex-croci-panca-inclinata-manubri",
    name: "Croci su panca inclinata con manubri",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle"],
    equipment: ["manubri", "panca"],
    instructions:
      "Gomiti morbidi e fermi a quell'angolo per tutta la serie: se si aprono e chiudono e' diventata una spinta.",
  },
  {
    id: "ex-chest-press-macchina",
    name: "Chest press alla macchina",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti", "spalle"],
    equipment: ["macchina"],
    instructions:
      "Regola il sedile in modo che le maniglie siano all'altezza della parte bassa del petto.",
  },
  {
    id: "ex-pectoral-machine",
    name: "Pectoral machine",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle"],
    equipment: ["macchina"],
    instructions:
      "Regola il sedile perche' le maniglie stiano all'altezza del petto, non delle spalle.",
  },
  {
    id: "ex-croci-cavi-alti",
    name: "Croci ai cavi alti",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle"],
    equipment: ["cavi"],
    instructions:
      "Chiudi le mani sotto la linea dello sterno, non davanti al viso.",
  },
  {
    id: "ex-croci-cavi-bassi",
    name: "Croci ai cavi bassi",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle"],
    equipment: ["cavi"],
    instructions:
      "Le mani si incontrano davanti allo sterno, non sopra la testa.",
  },
  {
    id: "ex-chest-press-cavi",
    name: "Chest press ai cavi",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti", "spalle"],
    equipment: ["cavi"],
    instructions:
      "Un passo avanti rispetto alle pulegge e busto appena inclinato: fermo sotto i cavi il petto non lavora.",
  },
  {
    id: "ex-piegamenti-braccia",
    name: "Piegamenti sulle braccia",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti", "spalle", "addome"],
    equipment: ["corpo_libero"],
    instructions:
      "Corpo in linea dalla testa ai talloni, gomiti a circa 45 gradi dal busto.",
  },
  {
    id: "ex-piegamenti-piedi-rialzati",
    name: "Piegamenti con i piedi rialzati",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle", "tricipiti", "addome"],
    equipment: ["corpo_libero", "panca"],
    instructions:
      "Piu' alti i piedi, piu' il lavoro sale verso le spalle: per il petto alto bastano 30-40 cm.",
  },
  {
    id: "ex-piegamenti-presa-larga",
    name: "Piegamenti a presa larga",
    muscleGroup: "petto",
    secondaryMuscles: ["spalle", "tricipiti"],
    equipment: ["corpo_libero"],
    instructions:
      "Mani poco piu' larghe delle spalle: oltre, le spalle vanno in tensione e il petto non guadagna niente.",
  },
  {
    id: "ex-dip-parallele-petto",
    name: "Dip alle parallele per il petto",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti", "spalle"],
    equipment: ["corpo_libero"],
    instructions:
      "Busto inclinato in avanti e gomiti leggermente aperti: da verticali diventa un esercizio per i tricipiti.",
  },
  {
    id: "ex-pullover-manubro",
    name: "Pullover con manubro",
    muscleGroup: "petto",
    secondaryMuscles: ["schiena", "tricipiti"],
    equipment: ["manubri", "panca"],
    instructions:
      "Scendi solo fin dove le spalle restano stabili, senza inarcare la zona lombare.",
  },
  {
    id: "ex-spinte-elastici-petto",
    name: "Spinte con elastici in piedi",
    muscleGroup: "petto",
    secondaryMuscles: ["tricipiti", "spalle"],
    equipment: ["elastici"],
    instructions:
      "L'elastico passa dietro la schiena all'altezza delle scapole, non del collo.",
  },

  // Schiena
  {
    id: "ex-stacco-da-terra",
    name: "Stacco da terra",
    muscleGroup: "schiena",
    secondaryMuscles: ["femorali", "glutei", "quadricipiti", "avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Schiena neutra, il bilanciere resta a contatto con le gambe per tutta la salita.",
  },
  {
    id: "ex-stacco-sumo",
    name: "Stacco sumo",
    muscleGroup: "schiena",
    secondaryMuscles: ["glutei", "quadricipiti", "femorali", "avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Punte dei piedi ruotate in fuori e ginocchia che spingono verso i gomiti.",
  },
  {
    id: "ex-rematore-bilanciere",
    name: "Rematore con bilanciere",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Busto a circa 45 gradi e fermo: se ti tiri su a ogni ripetizione stai barando.",
  },
  {
    id: "ex-rematore-manubrio-un-braccio",
    name: "Rematore con manubrio a un braccio",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["manubri", "panca"],
    instructions:
      "Tira il gomito verso l'anca, non verso la spalla, evitando di ruotare il busto.",
  },
  {
    id: "ex-rematore-pendlay",
    name: "Rematore Pendlay",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Il bilanciere torna a terra e si ferma a ogni ripetizione, busto parallelo al suolo.",
  },
  {
    id: "ex-rematore-bilanciere-presa-inversa",
    name: "Rematore con bilanciere presa inversa",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Presa supina e gomiti stretti al corpo: e' la variante che porta il lavoro sul gran dorsale basso.",
  },
  {
    id: "ex-lat-machine-avanti",
    name: "Lat machine avanti",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["macchina"],
    instructions:
      "Porta la barra allo sterno abbassando prima le scapole, senza sdraiarti indietro.",
  },
  {
    id: "ex-lat-machine-presa-inversa",
    name: "Lat machine presa inversa",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti"],
    equipment: ["macchina"],
    instructions:
      "Tira portando i gomiti verso i fianchi e non verso il basso: la barra arriva alle clavicole.",
  },
  {
    id: "ex-lat-machine-presa-stretta",
    name: "Lat machine presa stretta con triangolo",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti"],
    equipment: ["macchina"],
    instructions:
      "Petto in fuori e triangolo al petto: tirando all'indietro col busto diventa un rematore.",
  },
  {
    id: "ex-pulley-basso",
    name: "Pulley basso",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["macchina"],
    instructions:
      "Il busto resta quasi verticale: l'oscillazione avanti e indietro toglie lavoro al dorso.",
  },
  {
    id: "ex-trazioni-presa-prona",
    name: "Trazioni alla sbarra presa prona",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["sbarra"],
    instructions:
      "Parti da braccia distese attivando le scapole prima di piegare i gomiti.",
  },
  {
    id: "ex-trazioni-presa-supina",
    name: "Trazioni presa supina",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["sbarra"],
    instructions:
      "Piu' facili delle prone perche' entrano i bicipiti: se le prone non vengono, si comincia da qui.",
  },
  {
    id: "ex-trazioni-presa-neutra",
    name: "Trazioni presa neutra",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["sbarra"],
    instructions:
      "La presa piu' gentile per la spalla: se la prona da fastidio, prova questa prima di rinunciare.",
  },
  {
    id: "ex-trazioni-assistite-macchina",
    name: "Trazioni assistite alla macchina",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti"],
    equipment: ["macchina"],
    instructions:
      "Piu' peso metti, piu' ti aiuta: si scala il contrappeso col tempo, non le ripetizioni.",
  },
  {
    id: "ex-pulldown-braccia-tese",
    name: "Pulldown ai cavi a braccia tese",
    muscleGroup: "schiena",
    secondaryMuscles: ["tricipiti", "addome"],
    equipment: ["cavi"],
    instructions:
      "Gomiti bloccati quasi dritti per tutto il movimento, l'arco lo fanno solo le spalle.",
  },
  {
    id: "ex-low-row-macchina",
    name: "Low row alla macchina",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti"],
    equipment: ["macchina"],
    instructions:
      "Petto appoggiato allo schienale: senza, si tira di schiena e tanto vale un rematore.",
  },
  {
    id: "ex-t-bar-row",
    name: "T-bar row",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Busto a 45 gradi e schiena ferma: il bilanciere sfiora le cosce e arriva all'ombelico.",
  },
  {
    id: "ex-rematore-cavo-un-braccio",
    name: "Rematore ai cavi a un braccio",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti"],
    equipment: ["cavi"],
    instructions:
      "Lascia andare avanti la spalla in allungamento e portala indietro in chiusura: e' meta' del movimento.",
  },
  {
    id: "ex-iperestensioni-panca-romana",
    name: "Iperestensioni alla panca romana",
    muscleGroup: "schiena",
    secondaryMuscles: ["glutei", "femorali"],
    equipment: ["macchina"],
    instructions:
      "Fermati quando il corpo è in linea: salire oltre comprime inutilmente le lombari.",
  },
  {
    id: "ex-australian-row-trx",
    name: "Rematore orizzontale al TRX",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "addome"],
    equipment: ["trx"],
    instructions:
      "Più avvicini i piedi al punto di ancoraggio, più l'esercizio diventa facile.",
  },
  {
    id: "ex-rematore-kettlebell",
    name: "Rematore con kettlebell",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti", "avambracci"],
    equipment: ["kettlebell"],
    instructions:
      "Mano libera su una panca e schiena parallela a terra: il bacino non ruota per far salire il peso.",
  },
  {
    id: "ex-shrug-bilanciere",
    name: "Shrug con bilanciere",
    muscleGroup: "schiena",
    secondaryMuscles: ["avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Solo salita e discesa delle spalle: ruotarle non aggiunge nulla al trapezio.",
  },
  {
    id: "ex-shrug-manubri",
    name: "Shrug con manubri",
    muscleGroup: "schiena",
    secondaryMuscles: ["avambracci"],
    equipment: ["manubri"],
    instructions:
      "Solo su e giu': far ruotare le spalle non aggiunge niente e carica l'articolazione.",
  },
  {
    id: "ex-superman",
    name: "Superman a terra",
    muscleGroup: "schiena",
    secondaryMuscles: ["glutei"],
    equipment: ["corpo_libero"],
    instructions:
      "Solleva poco e tieni due secondi: e' un esercizio di tenuta, non di ampiezza.",
  },
  {
    id: "ex-rematore-elastici",
    name: "Rematore con elastici",
    muscleGroup: "schiena",
    secondaryMuscles: ["bicipiti"],
    equipment: ["elastici"],
    instructions:
      "Ancora l'elastico all'altezza dell'ombelico e tira ai fianchi chiudendo le scapole.",
  },

  // Spalle
  {
    id: "ex-military-press-bilanciere",
    name: "Military press con bilanciere",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti", "addome"],
    equipment: ["bilanciere"],
    instructions:
      "Glutei e addome contratti per non inarcare la schiena, la testa arretra per far passare il bilanciere.",
  },
  {
    id: "ex-lento-avanti-seduto-bilanciere",
    name: "Lento avanti seduto con bilanciere",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti"],
    equipment: ["bilanciere", "panca"],
    instructions:
      "Schienale quasi verticale e bilanciere davanti al viso: dietro la nuca carica la spalla senza dare niente in piu'.",
  },
  {
    id: "ex-shoulder-press-manubri",
    name: "Shoulder press con manubri",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti"],
    equipment: ["manubri", "panca"],
    instructions:
      "I manubri partono all'altezza delle orecchie e salgono appena convergenti.",
  },
  {
    id: "ex-arnold-press",
    name: "Arnold press",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti"],
    equipment: ["manubri", "panca"],
    instructions:
      "Parti con i palmi verso di te e ruota progressivamente durante la spinta.",
  },
  {
    id: "ex-shoulder-press-macchina",
    name: "Shoulder press alla macchina",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti"],
    equipment: ["macchina"],
    instructions:
      "Regola il sedile perche' le maniglie partano all'altezza delle spalle, non sopra.",
  },
  {
    id: "ex-alzate-laterali-manubri",
    name: "Alzate laterali con manubri",
    muscleGroup: "spalle",
    secondaryMuscles: [],
    equipment: ["manubri"],
    instructions:
      "Sali fino all'altezza delle spalle guidando con i gomiti, senza slanciare con le gambe.",
  },
  {
    id: "ex-alzate-laterali-cavi",
    name: "Alzate laterali ai cavi",
    muscleGroup: "spalle",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "Col cavo che passa dietro la schiena la tensione c'e' anche in basso, dove coi manubri sparisce.",
  },
  {
    id: "ex-alzate-laterali-macchina",
    name: "Alzate laterali alla macchina",
    muscleGroup: "spalle",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Spingi coi gomiti contro i cuscinetti e non con le mani: e' cosi' che resta lavoro del deltoide.",
  },
  {
    id: "ex-alzate-laterali-elastici",
    name: "Alzate laterali con elastici",
    muscleGroup: "spalle",
    secondaryMuscles: [],
    equipment: ["elastici"],
    instructions:
      "L'elastico e' piu' duro in alto, dove il deltoide e' piu' forte: e' il suo vantaggio, non un difetto.",
  },
  {
    id: "ex-alzate-frontali-manubri",
    name: "Alzate frontali con manubri",
    muscleGroup: "spalle",
    secondaryMuscles: [],
    equipment: ["manubri"],
    instructions:
      "Fino all'altezza delle spalle e basta: piu' su lavora il trapezio.",
  },
  {
    id: "ex-alzate-frontali-bilanciere",
    name: "Alzate frontali con bilanciere",
    muscleGroup: "spalle",
    secondaryMuscles: [],
    equipment: ["bilanciere"],
    instructions:
      "Presa larghezza spalle e niente slancio di bacino: se serve la spinta, il peso e' troppo.",
  },
  {
    id: "ex-alzate-frontali-cavi",
    name: "Alzate frontali ai cavi",
    muscleGroup: "spalle",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "Cavo basso che passa dietro le gambe: la tensione c'e' fin dal primo grado.",
  },
  {
    id: "ex-alzate-posteriori-manubri",
    name: "Alzate posteriori con manubri",
    muscleGroup: "spalle",
    secondaryMuscles: ["schiena"],
    equipment: ["manubri"],
    instructions:
      "Busto quasi parallelo al pavimento, apri le braccia senza avvicinare le scapole.",
  },
  {
    id: "ex-reverse-pectoral-machine",
    name: "Reverse pectoral machine",
    muscleGroup: "spalle",
    secondaryMuscles: ["schiena"],
    equipment: ["macchina"],
    instructions:
      "Petto contro il cuscinetto e braccia quasi tese: sono i deltoidi posteriori, non la schiena.",
  },
  {
    id: "ex-croci-inverse-cavi",
    name: "Croci inverse ai cavi",
    muscleGroup: "spalle",
    secondaryMuscles: ["schiena"],
    equipment: ["cavi"],
    instructions:
      "Cavi incrociati davanti e braccia che si aprono larghe: i gomiti restano fissi, si muove la spalla.",
  },
  {
    id: "ex-face-pull",
    name: "Face pull ai cavi",
    muscleGroup: "spalle",
    secondaryMuscles: ["schiena"],
    equipment: ["cavi"],
    instructions:
      "Cavo all'altezza del viso: tira la corda verso la fronte aprendo i gomiti alti.",
  },
  {
    id: "ex-tirate-al-mento-bilanciere",
    name: "Tirate al mento con bilanciere",
    muscleGroup: "spalle",
    secondaryMuscles: ["schiena", "bicipiti"],
    equipment: ["bilanciere"],
    instructions:
      "Presa poco più larga delle spalle e stop all'altezza dello sterno per non irritare la spalla.",
  },
  {
    id: "ex-tirate-al-mento-cavi",
    name: "Tirate al mento ai cavi",
    muscleGroup: "spalle",
    secondaryMuscles: ["schiena", "bicipiti"],
    equipment: ["cavi"],
    instructions:
      "Gomiti sopra le mani e non oltre l'altezza delle spalle: piu' su l'articolazione si chiude.",
  },
  {
    id: "ex-push-press",
    name: "Push press con bilanciere",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti", "quadricipiti", "glutei"],
    equipment: ["bilanciere"],
    instructions:
      "Breve piegamento di gambe e spinta esplosiva: la pausa in basso annulla la trasmissione.",
  },
  {
    id: "ex-shoulder-press-kettlebell",
    name: "Shoulder press con kettlebell",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti", "addome"],
    equipment: ["kettlebell"],
    instructions:
      "Il peso resta dietro l'avambraccio: col polso piegato indietro il carico va tutto li'.",
  },
  {
    id: "ex-pike-push-up",
    name: "Pike push up",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti", "petto"],
    equipment: ["corpo_libero"],
    instructions:
      "Bacino alto e testa che scende davanti alle mani, non tra le mani.",
  },
  {
    id: "ex-handstand-push-up-muro",
    name: "Handstand push up al muro",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti", "addome"],
    equipment: ["corpo_libero"],
    instructions:
      "Serve prima una verticale stabile: il piegamento comincia da pochi centimetri.",
  },

  // Bicipiti
  {
    id: "ex-curl-bilanciere",
    name: "Curl con bilanciere",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Gomiti fermi lungo i fianchi: se scappano in avanti il carico passa alle spalle.",
  },
  {
    id: "ex-curl-bilanciere-ez",
    name: "Curl con bilanciere EZ",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "L'impugnatura obliqua toglie tensione ai polsi: se il bilanciere dritto da fastidio, e' questa la variante.",
  },
  {
    id: "ex-curl-manubri",
    name: "Curl con manubri",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["manubri"],
    instructions:
      "Gomiti fermi al fianco: se vanno avanti, meta' del lavoro passa alle spalle.",
  },
  {
    id: "ex-curl-alternato-manubri",
    name: "Curl alternato con manubri",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["manubri"],
    instructions:
      "Uno alla volta lascia finire la serie con piu' carico che a coppia.",
  },
  {
    id: "ex-curl-a-martello",
    name: "Curl a martello",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["manubri"],
    instructions:
      "Presa neutra: entra il brachiale, che sta sotto il bicipite e lo spinge in alto.",
  },
  {
    id: "ex-curl-a-martello-cavi-corda",
    name: "Curl a martello ai cavi con corda",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["cavi"],
    instructions: "Come col manubrio, ma senza il punto morto in basso.",
  },
  {
    id: "ex-curl-panca-inclinata-manubri",
    name: "Curl su panca inclinata con manubri",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["manubri", "panca"],
    instructions:
      "Le braccia restano dietro la linea del busto: è quello che allunga il capo lungo.",
  },
  {
    id: "ex-curl-concentrato",
    name: "Curl concentrato",
    muscleGroup: "bicipiti",
    secondaryMuscles: [],
    equipment: ["manubri", "panca"],
    instructions:
      "Gomito appoggiato all'interno coscia: e' l'unico modo di non barare con la spalla.",
  },
  {
    id: "ex-curl-panca-scott",
    name: "Curl alla panca Scott",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["bilanciere", "panca"],
    instructions:
      "Non distendere completamente il gomito in basso, la spalla resta appoggiata al cuscino.",
  },
  {
    id: "ex-spider-curl",
    name: "Spider curl",
    muscleGroup: "bicipiti",
    secondaryMuscles: [],
    equipment: ["manubri", "panca"],
    instructions:
      "Petto contro lo schienale inclinato e braccia a penzoloni: la contrazione di picco e' in alto.",
  },
  {
    id: "ex-curl-macchina",
    name: "Curl alla macchina",
    muscleGroup: "bicipiti",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Ascelle appoggiate al cuscinetto: se si staccano, sta lavorando la schiena.",
  },
  {
    id: "ex-curl-cavi-bassi",
    name: "Curl ai cavi bassi",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["cavi"],
    instructions:
      "Un passo indietro rispetto alla puleggia: cosi' la tensione resta anche a braccio disteso.",
  },
  {
    id: "ex-curl-21",
    name: "Curl a 21 con bilanciere",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["bilanciere"],
    instructions:
      "Sette ripetizioni nella metà bassa, sette nella metà alta, sette complete senza pause.",
  },
  {
    id: "ex-curl-kettlebell",
    name: "Curl con kettlebell",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["kettlebell"],
    instructions:
      "Il peso pende sotto la mano e sposta il carico verso il fondo del movimento.",
  },
  {
    id: "ex-curl-elastici",
    name: "Curl con elastici",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["avambracci"],
    equipment: ["elastici"],
    instructions: "Piedi sull'elastico: piu' li tieni stretti, piu' e' duro.",
  },
  {
    id: "ex-curl-trx",
    name: "Curl al TRX",
    muscleGroup: "bicipiti",
    secondaryMuscles: ["addome"],
    equipment: ["trx"],
    instructions:
      "Piu' ti avvicini all'ancoraggio, piu' il corpo si inclina e piu' pesa: si regola coi piedi, non col carico.",
  },

  // Tricipiti
  {
    id: "ex-panca-presa-stretta",
    name: "Panca piana presa stretta",
    muscleGroup: "tricipiti",
    secondaryMuscles: ["petto", "spalle"],
    equipment: ["bilanciere", "panca"],
    instructions:
      "Mani larghe quanto le spalle e gomiti vicini al busto, non più strette di così.",
  },
  {
    id: "ex-french-press-ez",
    name: "French press con bilanciere EZ",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["bilanciere", "panca"],
    instructions:
      "I gomiti restano fermi e puntati al soffitto, si muovono solo gli avambracci.",
  },
  {
    id: "ex-skull-crusher-manubri",
    name: "Skull crusher con manubri",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["manubri", "panca"],
    instructions:
      "I manubri scendono ai lati della testa e non sulla fronte: gomiti fermi, si muove solo l'avambraccio.",
  },
  {
    id: "ex-estensioni-sopra-testa-manubro",
    name: "Estensioni sopra la testa con manubro",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["manubri"],
    instructions:
      "Braccia vicine alle orecchie: il capo lungo lavora solo con la spalla in flessione.",
  },
  {
    id: "ex-estensioni-sopra-testa-cavi",
    name: "Estensioni sopra la testa ai cavi con corda",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "Un passo avanti e busto inclinato: e' la posizione che allunga il capo lungo del tricipite.",
  },
  {
    id: "ex-push-down-barra",
    name: "Push down ai cavi con barra",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "Gomiti incollati ai fianchi: se si alzano, il petto ruba il lavoro.",
  },
  {
    id: "ex-push-down-corda",
    name: "Push down ai cavi con corda",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "In basso apri le estremità della corda verso l'esterno per completare la contrazione.",
  },
  {
    id: "ex-push-down-presa-inversa",
    name: "Push down presa inversa ai cavi",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "Presa supina, e serve meno peso di quanto sembri: e' il polso a cedere per primo se si esagera.",
  },
  {
    id: "ex-push-down-elastico",
    name: "Push down con elastico",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["elastici"],
    instructions:
      "Ancora l'elastico sopra la testa e tieni i gomiti fermi al busto.",
  },
  {
    id: "ex-kickback-manubri",
    name: "Kickback con manubri",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["manubri"],
    instructions:
      "Braccio parallelo al busto e si estende solo l'avambraccio: e' contrazione, non carico.",
  },
  {
    id: "ex-kickback-cavi",
    name: "Kickback ai cavi",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "Come col manubrio, ma la tensione resta anche a braccio piegato.",
  },
  {
    id: "ex-dip-parallele",
    name: "Dip alle parallele",
    muscleGroup: "tricipiti",
    secondaryMuscles: ["petto", "spalle"],
    equipment: ["corpo_libero"],
    instructions:
      "Busto verticale e gomiti stretti per tenere il lavoro sui tricipiti.",
  },
  {
    id: "ex-dip-tra-due-panche",
    name: "Dip tra due panche",
    muscleGroup: "tricipiti",
    secondaryMuscles: ["spalle"],
    equipment: ["panca"],
    instructions:
      "Piu' avanti tieni i piedi, piu' e' difficile: senza zavorra e' l'unico modo di aumentare.",
  },
  {
    id: "ex-dip-macchina-assistita",
    name: "Dip alla macchina assistita",
    muscleGroup: "tricipiti",
    secondaryMuscles: ["petto", "spalle"],
    equipment: ["macchina"],
    instructions:
      "Busto verticale per i tricipiti, inclinato in avanti per il petto.",
  },
  {
    id: "ex-piegamenti-diamante",
    name: "Piegamenti a diamante",
    muscleGroup: "tricipiti",
    secondaryMuscles: ["petto", "spalle"],
    equipment: ["corpo_libero"],
    instructions:
      "Mani sotto lo sterno, indici e pollici a formare un rombo, gomiti stretti al corpo.",
  },
  {
    id: "ex-estensioni-tricipiti-macchina",
    name: "Estensioni tricipiti alla macchina",
    muscleGroup: "tricipiti",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Il tronco resta fermo contro lo schienale: si muovono solo gli avambracci.",
  },
  {
    id: "ex-estensioni-tricipiti-trx",
    name: "Estensioni tricipiti al TRX",
    muscleGroup: "tricipiti",
    secondaryMuscles: ["addome"],
    equipment: ["trx"],
    instructions:
      "Piu' orizzontale stai, piu' pesa: si regola camminando coi piedi.",
  },

  // Quadricipiti
  {
    id: "ex-squat-bilanciere",
    name: "Squat con bilanciere",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "femorali", "addome", "schiena"],
    equipment: ["bilanciere"],
    instructions:
      "Ginocchia in linea con le punte dei piedi, scendi almeno fino al parallelo mantenendo i talloni a terra.",
  },
  {
    id: "ex-front-squat",
    name: "Front squat",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "addome", "schiena"],
    equipment: ["bilanciere"],
    instructions:
      "Gomiti alti per tutta l'alzata: se cadono il bilanciere scivola in avanti.",
  },
  {
    id: "ex-zercher-squat",
    name: "Zercher squat",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "addome", "schiena"],
    equipment: ["bilanciere"],
    instructions:
      "Il bilanciere nell'incavo dei gomiti obbliga il busto a restare verticale, e il carico va sui quadricipiti.",
  },
  {
    id: "ex-goblet-squat",
    name: "Goblet squat con kettlebell",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "addome"],
    equipment: ["kettlebell"],
    instructions:
      "Il kettlebell al petto fa da contrappeso: e' il modo piu' rapido per imparare a scendere in profondita'.",
  },
  {
    id: "ex-squat-corpo-libero",
    name: "Squat a corpo libero",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei"],
    equipment: ["corpo_libero"],
    instructions:
      "Scendi almeno finche' le cosce sono parallele, ginocchia in linea con le punte dei piedi.",
  },
  {
    id: "ex-squat-multipower",
    name: "Squat al multipower",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "femorali"],
    equipment: ["macchina", "bilanciere"],
    instructions:
      "La traiettoria e' guidata, quindi i piedi possono stare piu' avanti: cosi' lavorano di piu' i quadricipiti.",
  },
  {
    id: "ex-hack-squat",
    name: "Hack squat alla macchina",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei"],
    equipment: ["macchina"],
    instructions:
      "Piedi bassi sulla pedana caricano i quadricipiti, alti spostano su glutei e femorali.",
  },
  {
    id: "ex-leg-press-45",
    name: "Leg press 45 gradi",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "femorali"],
    equipment: ["macchina"],
    instructions:
      "Fermati prima che il bacino si stacchi dallo schienale e non bloccare le ginocchia in alto.",
  },
  {
    id: "ex-leg-extension",
    name: "Leg extension",
    muscleGroup: "quadricipiti",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Allinea l'asse di rotazione della macchina al ginocchio, o lavora l'articolazione invece del muscolo.",
  },
  {
    id: "ex-affondi-manubri",
    name: "Affondi con manubri",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "femorali"],
    equipment: ["manubri"],
    instructions:
      "Il ginocchio davanti resta sopra la caviglia, quello dietro sfiora terra.",
  },
  {
    id: "ex-affondi-camminati-bilanciere",
    name: "Affondi camminati con bilanciere",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "femorali", "addome"],
    equipment: ["bilanciere"],
    instructions: "Passo lungo per i glutei, passo corto per i quadricipiti.",
  },
  {
    id: "ex-affondi-indietro",
    name: "Affondi indietro a corpo libero",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei"],
    equipment: ["corpo_libero"],
    instructions:
      "Piu' facili da controllare di quelli in avanti, e piu' gentili col ginocchio.",
  },
  {
    id: "ex-bulgarian-split-squat",
    name: "Bulgarian split squat",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "femorali"],
    equipment: ["manubri", "panca"],
    instructions:
      "Più avanti metti il piede d'appoggio, più il lavoro passa dal quadricipite al gluteo.",
  },
  {
    id: "ex-step-up-panca-manubri",
    name: "Step up su panca con manubri",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei"],
    equipment: ["manubri", "panca"],
    instructions:
      "Spingi con la gamba sopra senza darti la spinta con il piede a terra.",
  },
  {
    id: "ex-sissy-squat",
    name: "Sissy squat",
    muscleGroup: "quadricipiti",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Ginocchia avanti e bacino in linea con le spalle, il busto si inclina indietro.",
  },
  {
    id: "ex-wall-sit",
    name: "Wall sit",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei"],
    equipment: ["corpo_libero"],
    instructions:
      "Cosce parallele a terra e schiena piatta al muro: si misura in secondi, non in ripetizioni.",
  },
  {
    id: "ex-pistol-squat",
    name: "Pistol squat",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "addome"],
    equipment: ["corpo_libero"],
    instructions:
      "Ci si arriva per gradi: prima seduti su una panca alta, poi sempre piu' bassa.",
  },
  {
    id: "ex-jump-squat",
    name: "Jump squat",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei", "polpacci"],
    equipment: ["corpo_libero"],
    instructions:
      "Atterra sull'avampiede ammortizzando con le ginocchia morbide.",
  },
  {
    id: "ex-squat-elastico",
    name: "Squat con elastico",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei"],
    equipment: ["elastici"],
    instructions:
      "L'elastico sopra le ginocchia serve a tenerle aperte: e' un correttivo, non un carico.",
  },

  // Femorali
  {
    id: "ex-stacco-rumeno-bilanciere",
    name: "Stacco rumeno con bilanciere",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "schiena"],
    equipment: ["bilanciere"],
    instructions:
      "Porta indietro il bacino con le ginocchia quasi ferme, scendi solo finché la schiena resta neutra.",
  },
  {
    id: "ex-stacco-rumeno-manubri",
    name: "Stacco rumeno con manubri",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "schiena"],
    equipment: ["manubri"],
    instructions:
      "Ginocchia poco piegate e ferme, il bacino va indietro: si scende finche' i femorali tirano, non fino a terra.",
  },
  {
    id: "ex-stacco-rumeno-kettlebell",
    name: "Stacco rumeno con kettlebell",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "schiena"],
    equipment: ["kettlebell"],
    instructions:
      "Stesso movimento dello stacco rumeno, ma il peso resta piu' vicino al corpo.",
  },
  {
    id: "ex-stacco-rumeno-una-gamba",
    name: "Stacco rumeno a una gamba con manubrio",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "schiena"],
    equipment: ["manubri"],
    instructions:
      "Bacino chiuso, senza far ruotare l'anca della gamba sollevata verso l'esterno.",
  },
  {
    id: "ex-stacco-gambe-tese",
    name: "Stacco a gambe tese",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "schiena"],
    equipment: ["bilanciere"],
    instructions:
      "Gambe quasi dritte e schiena in tensione: se la schiena si curva, il carico e' troppo.",
  },
  {
    id: "ex-good-morning",
    name: "Good morning con bilanciere",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "schiena"],
    equipment: ["bilanciere"],
    instructions:
      "Carico leggero e schiena neutra: la leva è lunga e la zona lombare va molto sotto stress.",
  },
  {
    id: "ex-leg-curl-sdraiato",
    name: "Leg curl sdraiato",
    muscleGroup: "femorali",
    secondaryMuscles: ["polpacci"],
    equipment: ["macchina"],
    instructions:
      "Bacino contro la panca: se si solleva, stai tirando con la schiena.",
  },
  {
    id: "ex-leg-curl-seduto",
    name: "Leg curl seduto",
    muscleGroup: "femorali",
    secondaryMuscles: ["polpacci"],
    equipment: ["macchina"],
    instructions:
      "Allunga i femorali piu' della versione sdraiata, perche' l'anca resta piegata.",
  },
  {
    id: "ex-leg-curl-in-piedi",
    name: "Leg curl in piedi a una gamba",
    muscleGroup: "femorali",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Una gamba per volta: e' il modo piu' semplice per scoprire quale delle due e' indietro.",
  },
  {
    id: "ex-nordic-curl",
    name: "Nordic curl",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei"],
    equipment: ["corpo_libero"],
    instructions:
      "Scendi il più lentamente possibile tenendo il bacino esteso, mani pronte a frenare a terra.",
  },
  {
    id: "ex-glute-ham-raise",
    name: "Glute ham raise",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "schiena"],
    equipment: ["macchina"],
    instructions:
      "Scendi lentamente e risali contraendo i femorali: se non risali, frena la discesa e aiutati con le mani.",
  },
  {
    id: "ex-hyperextension-45",
    name: "Hyperextension a 45 gradi",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "schiena"],
    equipment: ["macchina"],
    instructions:
      "Schiena neutra per tutto il movimento: e' un esercizio di catena posteriore, non di flessione lombare.",
  },
  {
    id: "ex-leg-curl-trx",
    name: "Leg curl al TRX",
    muscleGroup: "femorali",
    secondaryMuscles: ["glutei", "addome"],
    equipment: ["trx"],
    instructions:
      "Tieni il bacino alto per tutta la serie, non lasciarlo cadere quando pieghi le ginocchia.",
  },
  {
    id: "ex-leg-curl-elastico",
    name: "Leg curl con elastico",
    muscleGroup: "femorali",
    secondaryMuscles: [],
    equipment: ["elastici"],
    instructions:
      "A pancia in giu', elastico alla caviglia e ancorato davanti.",
  },

  // Glutei
  {
    id: "ex-hip-thrust-bilanciere",
    name: "Hip thrust con bilanciere",
    muscleGroup: "glutei",
    secondaryMuscles: ["femorali", "quadricipiti"],
    equipment: ["bilanciere", "panca"],
    instructions:
      "In alto chiudi il bacino con l'addome, senza inarcare la schiena per salire di più.",
  },
  {
    id: "ex-hip-thrust-macchina",
    name: "Hip thrust alla macchina",
    muscleGroup: "glutei",
    secondaryMuscles: ["femorali"],
    equipment: ["macchina"],
    instructions:
      "Mento verso il petto e spinta dai talloni: in alto il bacino non supera la linea del busto.",
  },
  {
    id: "ex-hip-thrust-una-gamba",
    name: "Hip thrust a una gamba",
    muscleGroup: "glutei",
    secondaryMuscles: ["femorali"],
    equipment: ["corpo_libero", "panca"],
    instructions:
      "Niente sovraccarico ma meta' del corpo su una gamba sola: il carico lo fanno le ripetizioni.",
  },
  {
    id: "ex-glute-bridge",
    name: "Glute bridge a terra",
    muscleGroup: "glutei",
    secondaryMuscles: ["femorali"],
    equipment: ["corpo_libero"],
    instructions:
      "Da terra l'escursione e' corta: e' il primo passo verso l'hip thrust, non un suo sostituto.",
  },
  {
    id: "ex-frog-pump",
    name: "Frog pump",
    muscleGroup: "glutei",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Piante dei piedi unite e ginocchia aperte: la posizione mette i glutei in vantaggio sui femorali.",
  },
  {
    id: "ex-abduttori-macchina",
    name: "Abduttori alla macchina",
    muscleGroup: "glutei",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Busto in avanti carica il gluteo medio, busto indietro il grande gluteo.",
  },
  {
    id: "ex-abduzione-anca-cavi",
    name: "Abduzione dell'anca ai cavi",
    muscleGroup: "glutei",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "Cavigliera alla gamba esterna e una mano che ti tiene: la gamba si apre senza inclinare il busto.",
  },
  {
    id: "ex-slanci-posteriori-cavi",
    name: "Slanci posteriori ai cavi",
    muscleGroup: "glutei",
    secondaryMuscles: ["femorali"],
    equipment: ["cavi"],
    instructions:
      "Il movimento è solo dell'anca: se la schiena si inarca stai usando le lombari.",
  },
  {
    id: "ex-slanci-quadrupedia",
    name: "Slanci posteriori a quattro zampe",
    muscleGroup: "glutei",
    secondaryMuscles: ["femorali"],
    equipment: ["corpo_libero"],
    instructions:
      "Il bacino resta parallelo a terra: se ruota, l'ampiezza in piu' viene dalla schiena.",
  },
  {
    id: "ex-monster-walk-elastico",
    name: "Camminata laterale con elastico",
    muscleGroup: "glutei",
    secondaryMuscles: ["quadricipiti"],
    equipment: ["elastici"],
    instructions:
      "Elastico sopra le ginocchia e passi laterali senza mai far avvicinare i piedi.",
  },
  {
    id: "ex-affondi-laterali",
    name: "Affondi laterali",
    muscleGroup: "glutei",
    secondaryMuscles: ["quadricipiti", "femorali"],
    equipment: ["corpo_libero"],
    instructions:
      "Il piede che si sposta resta dritto e il ginocchio segue la punta, mentre il bacino va indietro.",
  },
  {
    id: "ex-step-up-alto",
    name: "Step up alto a corpo libero",
    muscleGroup: "glutei",
    secondaryMuscles: ["quadricipiti"],
    equipment: ["corpo_libero"],
    instructions:
      "Serve un rialzo sopra l'altezza del ginocchio, altrimenti lavora soprattutto il quadricipite.",
  },
  {
    id: "ex-sumo-squat-manubro",
    name: "Sumo squat con manubrio",
    muscleGroup: "glutei",
    secondaryMuscles: ["quadricipiti", "femorali"],
    equipment: ["manubri"],
    instructions:
      "Piedi larghi e punte aperte: il manubrio scende in mezzo alle gambe.",
  },
  {
    id: "ex-kettlebell-swing",
    name: "Kettlebell swing",
    muscleGroup: "glutei",
    secondaryMuscles: ["femorali", "schiena", "addome"],
    equipment: ["kettlebell"],
    instructions:
      "La kettlebell sale per la spinta d'anca, non perché la alzi con le braccia.",
  },

  // Polpacci
  {
    id: "ex-calf-raise-in-piedi-macchina",
    name: "Calf raise in piedi alla macchina",
    muscleGroup: "polpacci",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Scendi in allungo completo sotto il livello del gradino prima di risalire.",
  },
  {
    id: "ex-calf-raise-seduto-macchina",
    name: "Calf raise seduto alla macchina",
    muscleGroup: "polpacci",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Con il ginocchio piegato lavora soprattutto il soleo: usa carichi più bassi e ripetizioni alte.",
  },
  {
    id: "ex-calf-raise-leg-press",
    name: "Calf raise al leg press",
    muscleGroup: "polpacci",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Solo le punte appoggiate alla pedana e ginocchia quasi tese.",
  },
  {
    id: "ex-donkey-calf-raise",
    name: "Donkey calf raise",
    muscleGroup: "polpacci",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions:
      "Busto piegato in avanti: e' la variante che allunga di piu' il polpaccio.",
  },
  {
    id: "ex-calf-raise-manubri",
    name: "Calf raise in piedi con manubri",
    muscleGroup: "polpacci",
    secondaryMuscles: ["avambracci"],
    equipment: ["manubri"],
    instructions:
      "Su un rialzo, cosi' il tallone scende sotto la punta: a terra manca meta' del movimento.",
  },
  {
    id: "ex-calf-raise-bilanciere",
    name: "Calf raise con bilanciere",
    muscleGroup: "polpacci",
    secondaryMuscles: [],
    equipment: ["bilanciere"],
    instructions:
      "Bilanciere sulle spalle come nello squat, salita lenta e pausa in alto.",
  },
  {
    id: "ex-calf-raise-una-gamba",
    name: "Calf raise a una gamba a corpo libero",
    muscleGroup: "polpacci",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Senza pesi ma su una gamba sola: e' cosi' che si carica a corpo libero.",
  },
  {
    id: "ex-calf-raise-elastico",
    name: "Calf raise con elastico",
    muscleGroup: "polpacci",
    secondaryMuscles: [],
    equipment: ["elastici"],
    instructions:
      "Elastico sotto la pianta e tenuto con le mani: la tensione e' massima in alto.",
  },

  // Addome
  {
    id: "ex-crunch-a-terra",
    name: "Crunch a terra",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Stacca solo le scapole arrotondando la schiena, non tirare il collo con le mani.",
  },
  {
    id: "ex-crunch-inverso",
    name: "Crunch inverso",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Solleva il bacino dal pavimento: se muovi solo le gambe lavorano i flessori dell'anca.",
  },
  {
    id: "ex-crunch-cavi",
    name: "Crunch ai cavi in ginocchio",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["cavi"],
    instructions:
      "Il bacino resta fermo, avvicini le costole al pube arrotondando la schiena.",
  },
  {
    id: "ex-crunch-macchina",
    name: "Crunch alla macchina",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["macchina"],
    instructions: "Si flette la colonna, non l'anca: il bacino resta fermo.",
  },
  {
    id: "ex-sit-up",
    name: "Sit up",
    muscleGroup: "addome",
    secondaryMuscles: ["quadricipiti"],
    equipment: ["corpo_libero"],
    instructions:
      "Piu' ampio del crunch, ma entra il flessore dell'anca: se la schiena tira, torna al crunch.",
  },
  {
    id: "ex-plank",
    name: "Plank",
    muscleGroup: "addome",
    secondaryMuscles: ["spalle", "glutei"],
    equipment: ["corpo_libero"],
    instructions:
      "Retroverti leggermente il bacino e contrai i glutei per togliere il carico dalle lombari.",
  },
  {
    id: "ex-plank-laterale",
    name: "Plank laterale",
    muscleGroup: "addome",
    secondaryMuscles: ["spalle", "glutei"],
    equipment: ["corpo_libero"],
    instructions:
      "Anca sollevata e corpo su una linea sola: appena il bacino scende, il tempo e' finito.",
  },
  {
    id: "ex-body-saw-trx",
    name: "Body saw al TRX",
    muscleGroup: "addome",
    secondaryMuscles: ["spalle"],
    equipment: ["trx"],
    instructions:
      "Dalla posizione di plank ci si spinge avanti e indietro coi piedi: bastano pochi centimetri.",
  },
  {
    id: "ex-mountain-climber",
    name: "Mountain climber",
    muscleGroup: "addome",
    secondaryMuscles: ["spalle", "quadricipiti"],
    equipment: ["corpo_libero"],
    instructions:
      "Il bacino resta basso e fermo: se rimbalza e' diventato cardio.",
  },
  {
    id: "ex-dead-bug",
    name: "Dead bug",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "La zona lombare resta schiacciata a terra: scendi solo fin dove riesci a tenerla aderente.",
  },
  {
    id: "ex-hollow-hold",
    name: "Hollow hold",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Lombari schiacciati a terra: se si staccano, alza gambe e braccia finche' non tornano giu'.",
  },
  {
    id: "ex-v-up",
    name: "V-up",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Gambe e busto salgono insieme a incontrarsi: se non ci arrivi, piega le ginocchia.",
  },
  {
    id: "ex-bicycle-crunch",
    name: "Bicycle crunch",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions: "Lento: conta la rotazione, non la velocita'.",
  },
  {
    id: "ex-russian-twist",
    name: "Russian twist",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Ruota il busto e non solo le braccia: le spalle devono girare insieme alle mani.",
  },
  {
    id: "ex-russian-twist-kettlebell",
    name: "Russian twist con kettlebell",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["kettlebell"],
    instructions:
      "Il peso passa da un fianco all'altro sfiorando terra, coi piedi sollevati se riesci.",
  },
  {
    id: "ex-leg-raise-a-terra",
    name: "Sollevamento gambe a terra",
    muscleGroup: "addome",
    secondaryMuscles: [],
    equipment: ["corpo_libero"],
    instructions:
      "Mani sotto i glutei per tenere la schiena a terra: le gambe scendono fin dove la schiena resta piatta.",
  },
  {
    id: "ex-leg-raise-sbarra",
    name: "Sollevamento gambe alla sbarra",
    muscleGroup: "addome",
    secondaryMuscles: ["avambracci"],
    equipment: ["sbarra"],
    instructions:
      "Evita l'oscillazione: parti da fermo e chiudi il bacino alla fine del movimento.",
  },
  {
    id: "ex-toes-to-bar",
    name: "Toes to bar",
    muscleGroup: "addome",
    secondaryMuscles: ["schiena", "avambracci"],
    equipment: ["sbarra"],
    instructions:
      "Prima si impara il sollevamento delle ginocchia: i piedi alla sbarra arrivano dopo.",
  },
  {
    id: "ex-sollevamento-ginocchia-parallele",
    name: "Sollevamento ginocchia alle parallele",
    muscleGroup: "addome",
    secondaryMuscles: ["spalle"],
    equipment: ["macchina"],
    instructions:
      "Niente slancio: se il corpo dondola, il lavoro e' passato alle spalle.",
  },
  {
    id: "ex-rollout-bilanciere",
    name: "Rollout con bilanciere",
    muscleGroup: "addome",
    secondaryMuscles: ["schiena", "spalle"],
    equipment: ["bilanciere"],
    instructions:
      "Allontanati solo fino al punto in cui la schiena non si inarca, poi torna indietro.",
  },
  {
    id: "ex-woodchopper-cavi",
    name: "Woodchopper ai cavi",
    muscleGroup: "addome",
    secondaryMuscles: ["spalle", "glutei"],
    equipment: ["cavi"],
    instructions:
      "In diagonale dall'alto al basso a braccia tese: ruota il busto, i piedi restano piantati.",
  },
  {
    id: "ex-pallof-press",
    name: "Pallof press ai cavi",
    muscleGroup: "addome",
    secondaryMuscles: ["spalle"],
    equipment: ["cavi"],
    instructions:
      "Il busto non deve ruotare: resisti alla trazione del cavo mentre distendi le braccia.",
  },
  {
    id: "ex-side-bend-manubrio",
    name: "Side bend con manubrio",
    muscleGroup: "addome",
    secondaryMuscles: ["avambracci"],
    equipment: ["manubri"],
    instructions:
      "Un manubrio solo: con due i carichi si annullano e l'esercizio perde senso.",
  },

  // Avambracci
  {
    id: "ex-curl-polsi-bilanciere",
    name: "Curl ai polsi con bilanciere",
    muscleGroup: "avambracci",
    secondaryMuscles: [],
    equipment: ["bilanciere", "panca"],
    instructions: "Avambracci appoggiati alla panca, si muovono solo i polsi.",
  },
  {
    id: "ex-curl-polsi-inverso-bilanciere",
    name: "Curl ai polsi inverso con bilanciere",
    muscleGroup: "avambracci",
    secondaryMuscles: [],
    equipment: ["bilanciere", "panca"],
    instructions:
      "Avambracci sulla panca e palmi in giu': movimento corto e carichi bassi.",
  },
  {
    id: "ex-curl-polsi-manubri",
    name: "Curl ai polsi con manubri",
    muscleGroup: "avambracci",
    secondaryMuscles: [],
    equipment: ["manubri", "panca"],
    instructions:
      "Avambracci appoggiati e polsi oltre il bordo: si scende fin dove le dita si aprono.",
  },
  {
    id: "ex-curl-inverso-ez",
    name: "Curl inverso con bilanciere EZ",
    muscleGroup: "avambracci",
    secondaryMuscles: ["bicipiti"],
    equipment: ["bilanciere"],
    instructions:
      "Presa prona: lavora il brachioradiale e chiede meno peso di un curl normale.",
  },
  {
    id: "ex-zottman-curl",
    name: "Zottman curl",
    muscleGroup: "avambracci",
    secondaryMuscles: ["bicipiti"],
    equipment: ["manubri"],
    instructions:
      "Sali con i palmi in su, ruota in alto e scendi lentamente con i palmi in giù.",
  },
  {
    id: "ex-farmer-walk-manubri",
    name: "Farmer's walk con manubri",
    muscleGroup: "avambracci",
    secondaryMuscles: ["schiena", "addome"],
    equipment: ["manubri"],
    instructions:
      "Cammina dritto con le spalle basse: la serie finisce quando cede la presa.",
  },
  {
    id: "ex-dead-hang-sbarra",
    name: "Dead hang alla sbarra",
    muscleGroup: "avambracci",
    secondaryMuscles: ["schiena"],
    equipment: ["sbarra"],
    instructions:
      "Appeso a braccia distese e spalle attive: si conta in secondi ed e' il modo piu' semplice di allenare la presa.",
  },

  // Full body
  {
    id: "ex-burpee",
    name: "Burpee",
    muscleGroup: "full_body",
    secondaryMuscles: ["petto", "quadricipiti", "spalle", "addome"],
    equipment: ["corpo_libero"],
    instructions:
      "Petto a terra e salto in alto: se manca il fiato si toglie il salto, non il piegamento.",
  },
  {
    id: "ex-thruster-bilanciere",
    name: "Thruster con bilanciere",
    muscleGroup: "full_body",
    secondaryMuscles: ["quadricipiti", "spalle", "glutei", "tricipiti"],
    equipment: ["bilanciere"],
    instructions:
      "Un unico movimento continuo: la spinta delle gambe si trasmette al bilanciere senza pause.",
  },
  {
    id: "ex-power-clean",
    name: "Girata al petto con bilanciere",
    muscleGroup: "full_body",
    secondaryMuscles: ["quadricipiti", "glutei", "schiena", "spalle"],
    equipment: ["bilanciere"],
    instructions:
      "Prima estendi completamente anche e ginocchia, solo dopo passi sotto al bilanciere.",
  },
  {
    id: "ex-clean-and-jerk",
    name: "Clean and jerk",
    muscleGroup: "full_body",
    secondaryMuscles: ["quadricipiti", "glutei", "spalle", "schiena"],
    equipment: ["bilanciere"],
    instructions:
      "Due movimenti in uno: si imparano separati, e col bilanciere scarico.",
  },
  {
    id: "ex-snatch-bilanciere",
    name: "Strappo con bilanciere",
    muscleGroup: "full_body",
    secondaryMuscles: ["spalle", "schiena", "quadricipiti", "glutei"],
    equipment: ["bilanciere"],
    instructions:
      "Il gesto piu' tecnico della sala pesi: senza qualcuno che guarda, meglio restare leggeri.",
  },
  {
    id: "ex-turkish-get-up",
    name: "Turkish get up con kettlebell",
    muscleGroup: "full_body",
    secondaryMuscles: ["spalle", "addome", "glutei"],
    equipment: ["kettlebell"],
    instructions:
      "Il braccio con il peso resta verticale e l'occhio fisso sulla kettlebell per tutta la salita.",
  },
  {
    id: "ex-kettlebell-clean-and-press",
    name: "Kettlebell clean and press",
    muscleGroup: "full_body",
    secondaryMuscles: ["spalle", "glutei", "schiena"],
    equipment: ["kettlebell"],
    instructions:
      "Il kettlebell si appoggia sull'avambraccio, non ci sbatte: la presa ruota durante la salita.",
  },
  {
    id: "ex-man-maker",
    name: "Man maker con manubri",
    muscleGroup: "full_body",
    secondaryMuscles: ["petto", "schiena", "spalle", "addome"],
    equipment: ["manubri"],
    instructions:
      "Piegamento, un rematore per lato e slancio sopra la testa: e' una serie da poche ripetizioni.",
  },
  {
    id: "ex-devil-press",
    name: "Devil press con manubri",
    muscleGroup: "full_body",
    secondaryMuscles: ["spalle", "petto", "glutei"],
    equipment: ["manubri"],
    instructions:
      "Burpee coi manubri che finisce sopra la testa: scegli un carico che regga fino all'ultima ripetizione.",
  },
  {
    id: "ex-bear-crawl",
    name: "Bear crawl",
    muscleGroup: "full_body",
    secondaryMuscles: ["addome", "spalle", "quadricipiti"],
    equipment: ["corpo_libero"],
    instructions:
      "Ginocchia a pochi centimetri da terra e bacino basso, senza far oscillare i fianchi.",
  },
  {
    id: "ex-jumping-jack",
    name: "Jumping jack",
    muscleGroup: "full_body",
    secondaryMuscles: ["polpacci", "spalle"],
    equipment: ["corpo_libero"],
    instructions: "Riscaldamento: serve ad alzare il battito, non a stancare.",
  },
  {
    id: "ex-salto-della-corda",
    name: "Salto della corda",
    muscleGroup: "full_body",
    secondaryMuscles: ["polpacci", "avambracci"],
    equipment: ["cardio"],
    instructions:
      "Salti bassi e polsi che girano: sono i polsi a muovere la corda, non le braccia.",
  },
  {
    id: "ex-vogatore",
    name: "Vogatore",
    muscleGroup: "full_body",
    secondaryMuscles: ["schiena", "quadricipiti", "bicipiti"],
    equipment: ["cardio"],
    instructions:
      "Sequenza gambe, busto, braccia in trazione e l'inverso in ritorno.",
  },
  {
    id: "ex-tapis-roulant",
    name: "Corsa sul tapis roulant",
    muscleGroup: "full_body",
    secondaryMuscles: ["quadricipiti", "polpacci", "femorali"],
    equipment: ["cardio"],
    instructions:
      "Pendenza al posto della velocita' se le ginocchia protestano: alza il costo senza aumentare l'impatto.",
  },
  {
    id: "ex-ellittica",
    name: "Ellittica",
    muscleGroup: "full_body",
    secondaryMuscles: ["quadricipiti", "glutei", "spalle"],
    equipment: ["cardio"],
    instructions:
      "Gesto senza impatto: la scelta quando ginocchia o caviglie non reggono la corsa.",
  },
  {
    id: "ex-assault-bike",
    name: "Assault bike",
    muscleGroup: "full_body",
    secondaryMuscles: ["quadricipiti", "spalle", "schiena"],
    equipment: ["cardio"],
    instructions:
      "Braccia e gambe insieme: bastano pochi minuti, ed e' il motivo per cui compare negli intervalli.",
  },
];
