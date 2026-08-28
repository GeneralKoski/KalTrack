import type { Nutrients } from "@/src/domain/nutrition";

export interface SeedFood {
  /** Id stabile: permette di riconoscere il seed già inserito e di aggiornarlo. */
  id: string;
  name: string;
  nutrients: Nutrients;
  isLiquid?: boolean;
  defaultServingG?: number;
  servingLabel?: string;
}

const f = (
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  extra: Partial<Nutrients> = {},
): Nutrients => ({
  kcal,
  protein,
  carbs,
  fat,
  sugars: 0,
  saturatedFat: 0,
  fiber: 0,
  salt: 0,
  ...extra,
});

export const SEED_FOODS: SeedFood[] = [
  // Cereali e derivati
  {
    id: "seed-pasta-semola-cruda",
    name: "Pasta di semola cruda",
    nutrients: f(353, 10.9, 71.2, 1.4, { sugars: 3.2, saturatedFat: 0.3, fiber: 2.7, salt: 0.01 }),
  },
  {
    id: "seed-pasta-integrale-cruda",
    name: "Pasta integrale cruda",
    nutrients: f(324, 13.4, 62, 2.5, { sugars: 2.5, saturatedFat: 0.5, fiber: 8, salt: 0.02 }),
  },
  {
    id: "seed-pasta-semola-cotta",
    name: "Pasta di semola cotta",
    nutrients: f(158, 5.1, 31.4, 0.6, { sugars: 1.4, saturatedFat: 0.1, fiber: 1.2, salt: 0.3 }),
  },
  {
    id: "seed-riso-bianco-crudo",
    name: "Riso bianco crudo",
    nutrients: f(358, 6.7, 80.4, 0.6, { sugars: 0.2, saturatedFat: 0.2, fiber: 1 }),
  },
  {
    id: "seed-riso-bianco-cotto",
    name: "Riso bianco cotto",
    nutrients: f(130, 2.7, 28.2, 0.3, { fiber: 0.4 }),
  },
  {
    id: "seed-riso-integrale-crudo",
    name: "Riso integrale crudo",
    nutrients: f(362, 7.5, 77.4, 2.7, { sugars: 0.7, saturatedFat: 0.6, fiber: 3.5 }),
  },
  {
    id: "seed-riso-basmati-crudo",
    name: "Riso basmati crudo",
    nutrients: f(356, 8.1, 78, 0.9, { saturatedFat: 0.2, fiber: 1.3 }),
  },
  {
    id: "seed-pane-bianco",
    name: "Pane bianco",
    nutrients: f(271, 8.8, 55, 1.3, { sugars: 1.5, saturatedFat: 0.3, fiber: 2.7, salt: 1.3 }),
    defaultServingG: 50,
    servingLabel: "1 fetta = 50 g",
  },
  {
    id: "seed-pane-integrale",
    name: "Pane integrale",
    nutrients: f(243, 9.4, 44.3, 2.5, { sugars: 2.5, saturatedFat: 0.5, fiber: 6.5, salt: 1.2 }),
    defaultServingG: 50,
    servingLabel: "1 fetta = 50 g",
  },
  {
    id: "seed-pane-segale",
    name: "Pane di segale",
    nutrients: f(259, 8.5, 51, 1.7, { sugars: 3.9, saturatedFat: 0.3, fiber: 5.8, salt: 1.1 }),
    defaultServingG: 50,
    servingLabel: "1 fetta = 50 g",
  },
  {
    id: "seed-fette-biscottate",
    name: "Fette biscottate",
    nutrients: f(408, 11.3, 76, 6, { sugars: 6.5, saturatedFat: 1, fiber: 3.5, salt: 1.2 }),
    defaultServingG: 10,
    servingLabel: "1 fetta biscottata = 10 g",
  },
  {
    id: "seed-cracker-salati",
    name: "Cracker salati",
    nutrients: f(428, 9.4, 70, 12, { sugars: 2, saturatedFat: 2.5, fiber: 3, salt: 2 }),
  },
  {
    id: "seed-fiocchi-avena",
    name: "Fiocchi d'avena",
    nutrients: f(379, 13.5, 60, 7, { sugars: 1, saturatedFat: 1.2, fiber: 10, salt: 0.02 }),
  },
  {
    id: "seed-farina-frumento-00",
    name: "Farina di frumento 00",
    nutrients: f(340, 11, 72, 1, { sugars: 1.5, saturatedFat: 0.2, fiber: 2.2 }),
  },
  {
    id: "seed-farina-integrale",
    name: "Farina integrale di frumento",
    nutrients: f(319, 11.9, 61, 1.9, { sugars: 1.5, saturatedFat: 0.3, fiber: 9 }),
  },
  {
    id: "seed-farro-perlato-crudo",
    name: "Farro perlato crudo",
    nutrients: f(335, 15.1, 67.1, 2.5, { sugars: 2, saturatedFat: 0.4, fiber: 6.8 }),
  },
  {
    id: "seed-orzo-perlato-crudo",
    name: "Orzo perlato crudo",
    nutrients: f(352, 10.4, 70.5, 1.4, { sugars: 0.8, saturatedFat: 0.3, fiber: 9.2 }),
  },
  {
    id: "seed-quinoa-cruda",
    name: "Quinoa cruda",
    nutrients: f(368, 14.1, 57.2, 6.1, { sugars: 4.6, saturatedFat: 0.7, fiber: 7 }),
  },
  {
    id: "seed-cous-cous-crudo",
    name: "Cous cous crudo",
    nutrients: f(376, 12.8, 72.4, 0.6, { sugars: 0.6, saturatedFat: 0.1, fiber: 5 }),
  },
  {
    id: "seed-mais-dolce-scatola",
    name: "Mais dolce in scatola",
    nutrients: f(86, 3.2, 15.6, 1.2, { sugars: 5, saturatedFat: 0.2, fiber: 2, salt: 0.7 }),
  },
  {
    id: "seed-farina-mais-polenta",
    name: "Farina di mais per polenta",
    nutrients: f(362, 8.1, 76.8, 1.5, { sugars: 0.6, saturatedFat: 0.2, fiber: 3 }),
  },
  {
    id: "seed-grissini",
    name: "Grissini",
    nutrients: f(433, 12.3, 68.4, 12, { sugars: 2.5, saturatedFat: 2, fiber: 3.3, salt: 1.7 }),
  },
  {
    id: "seed-corn-flakes",
    name: "Corn flakes",
    nutrients: f(375, 7.5, 84, 0.9, { sugars: 8, saturatedFat: 0.2, fiber: 3, salt: 1.1 }),
  },
  {
    id: "seed-piadina",
    name: "Piadina",
    nutrients: f(320, 8, 47, 10.5, { sugars: 2, saturatedFat: 5, fiber: 2, salt: 1.5 }),
  },

  // Carni
  {
    id: "seed-petto-pollo",
    name: "Petto di pollo crudo",
    nutrients: f(110, 23.3, 0, 1.6, { saturatedFat: 0.5, salt: 0.1 }),
  },
  {
    id: "seed-coscia-pollo",
    name: "Coscia di pollo cruda senza pelle",
    nutrients: f(130, 19, 0, 5.7, { saturatedFat: 1.5, salt: 0.1 }),
  },
  {
    id: "seed-petto-tacchino",
    name: "Petto di tacchino crudo",
    nutrients: f(107, 24, 0, 1.2, { saturatedFat: 0.4, salt: 0.1 }),
  },
  {
    id: "seed-fesa-tacchino-affettata",
    name: "Fesa di tacchino affettata",
    nutrients: f(107, 19, 1.5, 2.5, { sugars: 1, saturatedFat: 0.8, salt: 1.8 }),
  },
  {
    id: "seed-bresaola",
    name: "Bresaola",
    nutrients: f(151, 32, 0.5, 2.6, { saturatedFat: 1, salt: 4.4 }),
  },
  {
    id: "seed-prosciutto-crudo",
    name: "Prosciutto crudo di Parma",
    nutrients: f(268, 26, 0.3, 18, { saturatedFat: 6.5, salt: 4.5 }),
  },
  {
    id: "seed-prosciutto-cotto",
    name: "Prosciutto cotto",
    nutrients: f(215, 19.8, 0.8, 14.7, { sugars: 0.5, saturatedFat: 5, salt: 2.3 }),
  },
  {
    id: "seed-speck",
    name: "Speck",
    nutrients: f(231, 31, 0.5, 12, { saturatedFat: 4.5, salt: 4.5 }),
  },
  {
    id: "seed-salame-milano",
    name: "Salame Milano",
    nutrients: f(384, 25, 1, 31, { saturatedFat: 12, salt: 4 }),
  },
  {
    id: "seed-mortadella",
    name: "Mortadella",
    nutrients: f(317, 15.5, 1.5, 28, { sugars: 1, saturatedFat: 10, salt: 2.4 }),
  },
  {
    id: "seed-pancetta-affumicata",
    name: "Pancetta affumicata",
    nutrients: f(400, 15, 0.5, 38, { saturatedFat: 14, salt: 3 }),
  },
  {
    id: "seed-controfiletto-manzo",
    name: "Controfiletto di manzo crudo",
    nutrients: f(149, 21.5, 0, 7, { saturatedFat: 2.8, salt: 0.1 }),
  },
  {
    id: "seed-macinato-manzo-magro",
    name: "Macinato di manzo magro crudo",
    nutrients: f(137, 21.5, 0, 5.5, { saturatedFat: 2.4, salt: 0.1 }),
  },
  {
    id: "seed-lombata-maiale",
    name: "Lombata di maiale cruda",
    nutrients: f(157, 21, 0, 8, { saturatedFat: 2.9, salt: 0.1 }),
  },
  {
    id: "seed-filetto-maiale",
    name: "Filetto di maiale crudo",
    nutrients: f(120, 22, 0, 3.5, { saturatedFat: 1.2, salt: 0.1 }),
  },
  {
    id: "seed-fesa-vitello",
    name: "Fesa di vitello cruda",
    nutrients: f(107, 21.5, 0, 2.5, { saturatedFat: 1, salt: 0.1 }),
  },
  {
    id: "seed-coscia-agnello",
    name: "Coscia di agnello cruda",
    nutrients: f(159, 20, 0, 8.8, { saturatedFat: 3.8, salt: 0.1 }),
  },
  {
    id: "seed-coniglio",
    name: "Coniglio crudo",
    nutrients: f(118, 21.5, 0, 3.5, { saturatedFat: 1.2, salt: 0.1 }),
  },
  {
    id: "seed-wurstel",
    name: "Wurstel di suino e bovino",
    nutrients: f(270, 12, 2, 24, { sugars: 1, saturatedFat: 9, salt: 2 }),
  },

  // Pesce e frutti di mare
  {
    id: "seed-merluzzo",
    name: "Merluzzo, filetto crudo",
    nutrients: f(82, 17.8, 0, 0.7, { saturatedFat: 0.1, salt: 0.3 }),
  },
  {
    id: "seed-salmone-fresco",
    name: "Salmone fresco crudo",
    nutrients: f(185, 20, 0, 12, { saturatedFat: 2.5, salt: 0.1 }),
  },
  {
    id: "seed-salmone-affumicato",
    name: "Salmone affumicato",
    nutrients: f(147, 22, 0, 6.5, { saturatedFat: 1.3, salt: 3.5 }),
  },
  {
    id: "seed-tonno-fresco",
    name: "Tonno fresco crudo",
    nutrients: f(144, 23, 0, 5.5, { saturatedFat: 1.4, salt: 0.1 }),
  },
  {
    id: "seed-tonno-naturale",
    name: "Tonno in scatola al naturale sgocciolato",
    nutrients: f(103, 23, 0, 1, { saturatedFat: 0.3, salt: 1 }),
  },
  {
    id: "seed-tonno-olio",
    name: "Tonno in scatola sott'olio sgocciolato",
    nutrients: f(192, 25, 0, 10, { saturatedFat: 1.8, salt: 1 }),
  },
  {
    id: "seed-orata",
    name: "Orata cruda",
    nutrients: f(121, 20, 0, 4.5, { saturatedFat: 1.1, salt: 0.2 }),
  },
  {
    id: "seed-branzino",
    name: "Branzino crudo",
    nutrients: f(97, 20, 0, 1.8, { saturatedFat: 0.5, salt: 0.2 }),
  },
  {
    id: "seed-sgombro",
    name: "Sgombro crudo",
    nutrients: f(205, 19, 0, 14, { saturatedFat: 3.4, salt: 0.2 }),
  },
  {
    id: "seed-acciughe-fresche",
    name: "Acciughe fresche",
    nutrients: f(131, 16.8, 0, 7, { saturatedFat: 1.8, salt: 0.3 }),
  },
  {
    id: "seed-sardine",
    name: "Sardine crude",
    nutrients: f(129, 20.8, 0, 4.5, { saturatedFat: 1.3, salt: 0.3 }),
  },
  {
    id: "seed-platessa",
    name: "Platessa cruda",
    nutrients: f(86, 16.9, 0, 1.7, { saturatedFat: 0.4, salt: 0.3 }),
  },
  {
    id: "seed-gamberi",
    name: "Gamberi crudi",
    nutrients: f(71, 13.6, 0.9, 0.6, { saturatedFat: 0.2, salt: 0.6 }),
  },
  {
    id: "seed-calamari",
    name: "Calamari crudi",
    nutrients: f(92, 15.6, 3, 1.4, { saturatedFat: 0.4, salt: 0.5 }),
  },
  {
    id: "seed-cozze",
    name: "Cozze sgusciate crude",
    nutrients: f(86, 11.7, 3.4, 2.7, { saturatedFat: 0.5, salt: 0.7 }),
  },
  {
    id: "seed-polpo",
    name: "Polpo crudo",
    nutrients: f(82, 14.9, 2.2, 1, { saturatedFat: 0.2, salt: 0.6 }),
  },
  {
    id: "seed-baccala-ammollato",
    name: "Baccalà ammollato",
    nutrients: f(95, 21, 0, 0.9, { saturatedFat: 0.2, salt: 1.5 }),
  },

  // Uova e latticini
  {
    id: "seed-uovo-intero",
    name: "Uovo di gallina intero crudo",
    nutrients: f(143, 12.6, 0.7, 9.5, { sugars: 0.4, saturatedFat: 3.1, salt: 0.35 }),
    defaultServingG: 55,
    servingLabel: "1 uovo medio = 55 g",
  },
  {
    id: "seed-albume",
    name: "Albume d'uovo",
    nutrients: f(52, 10.9, 0.7, 0.2, { sugars: 0.7, salt: 0.4 }),
    defaultServingG: 33,
    servingLabel: "1 albume = 33 g",
  },
  {
    id: "seed-tuorlo",
    name: "Tuorlo d'uovo",
    nutrients: f(322, 15.8, 0.6, 28.5, { sugars: 0.6, saturatedFat: 9.5, salt: 0.13 }),
    defaultServingG: 18,
    servingLabel: "1 tuorlo = 18 g",
  },
  {
    id: "seed-latte-intero",
    name: "Latte intero",
    nutrients: f(64, 3.3, 4.9, 3.6, { sugars: 4.9, saturatedFat: 2.3, salt: 0.1 }),
    isLiquid: true,
    defaultServingG: 200,
    servingLabel: "1 bicchiere = 200 ml",
  },
  {
    id: "seed-latte-parzialmente-scremato",
    name: "Latte parzialmente scremato",
    nutrients: f(46, 3.3, 5, 1.5, { sugars: 5, saturatedFat: 1, salt: 0.1 }),
    isLiquid: true,
    defaultServingG: 200,
    servingLabel: "1 bicchiere = 200 ml",
  },
  {
    id: "seed-latte-scremato",
    name: "Latte scremato",
    nutrients: f(36, 3.5, 5.2, 0.2, { sugars: 5.2, saturatedFat: 0.1, salt: 0.1 }),
    isLiquid: true,
    defaultServingG: 200,
    servingLabel: "1 bicchiere = 200 ml",
  },
  {
    id: "seed-yogurt-bianco-intero",
    name: "Yogurt bianco intero",
    nutrients: f(66, 3.8, 4.3, 3.9, { sugars: 4.3, saturatedFat: 2.5, salt: 0.12 }),
    defaultServingG: 125,
    servingLabel: "1 vasetto = 125 g",
  },
  {
    id: "seed-yogurt-magro",
    name: "Yogurt bianco magro",
    nutrients: f(43, 4.4, 5.9, 0.2, { sugars: 5.9, saturatedFat: 0.1, salt: 0.13 }),
    defaultServingG: 125,
    servingLabel: "1 vasetto = 125 g",
  },
  {
    id: "seed-yogurt-greco-0",
    name: "Yogurt greco 0% grassi",
    nutrients: f(57, 10, 4, 0.4, { sugars: 4, saturatedFat: 0.1, salt: 0.1 }),
    defaultServingG: 150,
    servingLabel: "1 vasetto = 150 g",
  },
  {
    id: "seed-yogurt-greco-intero",
    name: "Yogurt greco intero",
    nutrients: f(97, 9, 3, 5.2, { sugars: 3, saturatedFat: 3.5, salt: 0.1 }),
    defaultServingG: 150,
    servingLabel: "1 vasetto = 150 g",
  },
  {
    id: "seed-skyr",
    name: "Skyr",
    nutrients: f(63, 11, 4, 0.2, { sugars: 4, saturatedFat: 0.1, salt: 0.1 }),
    defaultServingG: 150,
    servingLabel: "1 vasetto = 150 g",
  },
  {
    id: "seed-grana-padano",
    name: "Grana Padano",
    nutrients: f(384, 33, 0, 28, { saturatedFat: 18, salt: 1.6 }),
  },
  {
    id: "seed-parmigiano-reggiano",
    name: "Parmigiano Reggiano",
    nutrients: f(387, 33, 0, 28.5, { saturatedFat: 19, salt: 1.6 }),
  },
  {
    id: "seed-mozzarella-vaccina",
    name: "Mozzarella di latte vaccino",
    nutrients: f(253, 18.7, 0.7, 19.5, { sugars: 0.7, saturatedFat: 12, salt: 0.7 }),
    defaultServingG: 125,
    servingLabel: "1 mozzarella = 125 g",
  },
  {
    id: "seed-mozzarella-bufala",
    name: "Mozzarella di bufala",
    nutrients: f(288, 16.7, 0.4, 24.4, { sugars: 0.4, saturatedFat: 16, salt: 0.6 }),
    defaultServingG: 125,
    servingLabel: "1 mozzarella = 125 g",
  },
  {
    id: "seed-ricotta-vaccina",
    name: "Ricotta vaccina",
    nutrients: f(146, 8.8, 3.5, 10.9, { sugars: 3.5, saturatedFat: 7, salt: 0.2 }),
  },
  {
    id: "seed-fiocchi-di-latte",
    name: "Fiocchi di latte",
    nutrients: f(98, 11, 3.4, 4.3, { sugars: 3.4, saturatedFat: 2.7, salt: 0.9 }),
  },
  {
    id: "seed-stracchino",
    name: "Stracchino",
    nutrients: f(300, 18, 1, 25, { sugars: 1, saturatedFat: 16, salt: 1 }),
  },
  {
    id: "seed-gorgonzola",
    name: "Gorgonzola",
    nutrients: f(324, 19, 1, 27, { sugars: 1, saturatedFat: 18, salt: 2 }),
  },
  {
    id: "seed-pecorino-romano",
    name: "Pecorino romano",
    nutrients: f(387, 26, 0.2, 32, { saturatedFat: 21, salt: 3.9 }),
  },
  {
    id: "seed-provolone",
    name: "Provolone",
    nutrients: f(351, 25, 0.5, 27.5, { saturatedFat: 18, salt: 1.8 }),
  },
  {
    id: "seed-formaggio-spalmabile",
    name: "Formaggio spalmabile",
    nutrients: f(253, 6, 4, 24, { sugars: 4, saturatedFat: 16, salt: 1 }),
  },
  {
    id: "seed-burrata",
    name: "Burrata",
    nutrients: f(300, 13, 2, 27, { sugars: 2, saturatedFat: 18, salt: 0.6 }),
  },
  {
    id: "seed-emmental",
    name: "Emmental",
    nutrients: f(380, 28, 1, 30, { sugars: 1, saturatedFat: 19, salt: 0.8 }),
  },
  {
    id: "seed-mascarpone",
    name: "Mascarpone",
    nutrients: f(450, 5, 3.5, 47, { sugars: 3, saturatedFat: 30, salt: 0.1 }),
  },

  // Legumi
  {
    id: "seed-lenticchie-secche",
    name: "Lenticchie secche",
    nutrients: f(325, 25, 51, 1, { sugars: 2, saturatedFat: 0.2, fiber: 14 }),
  },
  {
    id: "seed-lenticchie-lessate",
    name: "Lenticchie lessate",
    nutrients: f(116, 9, 16.3, 0.4, { sugars: 0.6, fiber: 8, salt: 0.2 }),
  },
  {
    id: "seed-ceci-secchi",
    name: "Ceci secchi",
    nutrients: f(343, 20.9, 47, 6.3, { sugars: 3, saturatedFat: 0.7, fiber: 13.6 }),
  },
  {
    id: "seed-ceci-lessati",
    name: "Ceci lessati",
    nutrients: f(120, 7, 18.9, 2.4, { sugars: 1.5, saturatedFat: 0.3, fiber: 5.4, salt: 0.3 }),
  },
  {
    id: "seed-fagioli-borlotti-secchi",
    name: "Fagioli borlotti secchi",
    nutrients: f(291, 20, 47, 2, { sugars: 2.2, saturatedFat: 0.3, fiber: 17 }),
  },
  {
    id: "seed-fagioli-cannellini-lessati",
    name: "Fagioli cannellini lessati",
    nutrients: f(91, 6.4, 14, 0.5, { sugars: 0.5, fiber: 6.4, salt: 0.3 }),
  },
  {
    id: "seed-piselli-freschi",
    name: "Piselli freschi crudi",
    nutrients: f(81, 5.4, 12.4, 0.4, { sugars: 5.7, fiber: 5.1 }),
  },
  {
    id: "seed-fave-fresche",
    name: "Fave fresche crude",
    nutrients: f(72, 5.5, 11, 0.5, { sugars: 2, fiber: 5 }),
  },
  {
    id: "seed-soia-gialla-secca",
    name: "Soia gialla secca",
    nutrients: f(407, 36.9, 23.3, 19.1, { sugars: 7, saturatedFat: 2.8, fiber: 11.9 }),
  },
  {
    id: "seed-edamame",
    name: "Edamame",
    nutrients: f(122, 11, 8.9, 5.2, { sugars: 2.2, saturatedFat: 0.6, fiber: 5, salt: 0.01 }),
  },
  {
    id: "seed-tofu",
    name: "Tofu",
    nutrients: f(115, 12.5, 1.5, 6.6, { sugars: 0.6, saturatedFat: 1, fiber: 0.9, salt: 0.02 }),
  },
  {
    id: "seed-tempeh",
    name: "Tempeh",
    nutrients: f(193, 19, 9, 11, { sugars: 1, saturatedFat: 2.2, fiber: 5, salt: 0.02 }),
  },
  {
    id: "seed-hummus",
    name: "Hummus",
    nutrients: f(237, 7.4, 14, 17, { sugars: 0.5, saturatedFat: 2.5, fiber: 6, salt: 1.2 }),
  },

  // Verdura
  {
    id: "seed-zucchine",
    name: "Zucchine crude",
    nutrients: f(17, 1.2, 2.2, 0.3, { sugars: 2, fiber: 1.1, salt: 0.01 }),
  },
  {
    id: "seed-melanzane",
    name: "Melanzane crude",
    nutrients: f(24, 1.1, 2.6, 0.4, { sugars: 2.4, fiber: 2.6, salt: 0.01 }),
  },
  {
    id: "seed-pomodori",
    name: "Pomodori maturi",
    nutrients: f(19, 1, 3.5, 0.2, { sugars: 3.1, fiber: 1.2, salt: 0.01 }),
  },
  {
    id: "seed-pomodorini",
    name: "Pomodorini ciliegino",
    nutrients: f(24, 1.1, 4.2, 0.3, { sugars: 4, fiber: 1.4, salt: 0.01 }),
  },
  {
    id: "seed-spinaci",
    name: "Spinaci crudi",
    nutrients: f(23, 2.9, 1.6, 0.4, { sugars: 0.4, fiber: 2.2, salt: 0.2 }),
  },
  {
    id: "seed-lattuga",
    name: "Lattuga",
    nutrients: f(15, 1.4, 1.5, 0.2, { sugars: 1.1, fiber: 1.3, salt: 0.02 }),
  },
  {
    id: "seed-rucola",
    name: "Rucola",
    nutrients: f(25, 2.6, 3.7, 0.7, { sugars: 2.1, fiber: 1.6, salt: 0.07 }),
  },
  {
    id: "seed-radicchio-rosso",
    name: "Radicchio rosso",
    nutrients: f(23, 1.4, 4.5, 0.2, { sugars: 0.6, fiber: 0.9, salt: 0.02 }),
  },
  {
    id: "seed-broccoli",
    name: "Broccoli crudi",
    nutrients: f(34, 2.8, 4, 0.4, { sugars: 1.7, fiber: 3, salt: 0.03 }),
  },
  {
    id: "seed-cavolfiore",
    name: "Cavolfiore crudo",
    nutrients: f(25, 1.9, 2.7, 0.3, { sugars: 2, fiber: 2.4, salt: 0.03 }),
  },
  {
    id: "seed-cavolo-nero",
    name: "Cavolo nero",
    nutrients: f(35, 3.3, 3.5, 0.6, { sugars: 1.5, fiber: 3.5, salt: 0.05 }),
  },
  {
    id: "seed-verza",
    name: "Verza",
    nutrients: f(27, 2, 3.9, 0.2, { sugars: 2.3, fiber: 3, salt: 0.02 }),
  },
  {
    id: "seed-carote",
    name: "Carote crude",
    nutrients: f(41, 0.9, 7.6, 0.2, { sugars: 4.8, fiber: 2.8, salt: 0.07 }),
  },
  {
    id: "seed-peperoni-rossi",
    name: "Peperoni rossi crudi",
    nutrients: f(31, 1, 6, 0.3, { sugars: 4.2, fiber: 2.1, salt: 0.01 }),
  },
  {
    id: "seed-cipolla",
    name: "Cipolla cruda",
    nutrients: f(40, 1.1, 9.3, 0.1, { sugars: 4.2, fiber: 1.7, salt: 0.01 }),
  },
  {
    id: "seed-aglio",
    name: "Aglio",
    nutrients: f(149, 6.4, 33, 0.5, { sugars: 1, fiber: 2.1, salt: 0.04 }),
  },
  {
    id: "seed-finocchio",
    name: "Finocchio crudo",
    nutrients: f(31, 1.2, 7.3, 0.2, { sugars: 3.9, fiber: 3.1, salt: 0.1 }),
  },
  {
    id: "seed-sedano",
    name: "Sedano crudo",
    nutrients: f(16, 0.7, 3, 0.2, { sugars: 1.3, fiber: 1.6, salt: 0.2 }),
  },
  {
    id: "seed-asparagi",
    name: "Asparagi crudi",
    nutrients: f(20, 2.2, 2, 0.1, { sugars: 1.9, fiber: 2.1, salt: 0.01 }),
  },
  {
    id: "seed-fagiolini",
    name: "Fagiolini crudi",
    nutrients: f(31, 1.8, 5, 0.1, { sugars: 3.3, fiber: 2.9, salt: 0.01 }),
  },
  {
    id: "seed-zucca",
    name: "Zucca gialla cruda",
    nutrients: f(26, 1, 3.5, 0.1, { sugars: 2.8, fiber: 0.5, salt: 0.01 }),
  },
  {
    id: "seed-patate",
    name: "Patate crude",
    nutrients: f(77, 2, 17, 0.1, { sugars: 0.8, fiber: 2.2, salt: 0.01 }),
  },
  {
    id: "seed-patate-dolci",
    name: "Patate dolci crude",
    nutrients: f(86, 1.6, 20, 0.1, { sugars: 4.2, fiber: 3, salt: 0.05 }),
  },
  {
    id: "seed-funghi-champignon",
    name: "Funghi champignon",
    nutrients: f(22, 3.1, 3.3, 0.3, { sugars: 2, fiber: 1, salt: 0.01 }),
  },
  {
    id: "seed-cetrioli",
    name: "Cetrioli",
    nutrients: f(14, 0.7, 1.8, 0.1, { sugars: 1.7, fiber: 0.8, salt: 0.01 }),
  },
  {
    id: "seed-cavolini-bruxelles",
    name: "Cavolini di Bruxelles",
    nutrients: f(43, 3.4, 4.2, 0.3, { sugars: 2.2, fiber: 3.8, salt: 0.03 }),
  },
  {
    id: "seed-bietola",
    name: "Bietola cruda",
    nutrients: f(19, 1.8, 2.1, 0.2, { sugars: 1.1, fiber: 1.6, salt: 0.2 }),
  },
  {
    id: "seed-barbabietola-cotta",
    name: "Barbabietola rossa cotta",
    nutrients: f(43, 1.6, 9.6, 0.2, { sugars: 6.8, fiber: 2.8, salt: 0.2 }),
  },

  // Frutta
  {
    id: "seed-mela",
    name: "Mela",
    nutrients: f(52, 0.3, 13.8, 0.2, { sugars: 10.4, fiber: 2.4 }),
    defaultServingG: 150,
    servingLabel: "1 mela media = 150 g",
  },
  {
    id: "seed-banana",
    name: "Banana",
    nutrients: f(89, 1.1, 22.8, 0.3, { sugars: 12.2, fiber: 2.6 }),
    defaultServingG: 120,
    servingLabel: "1 banana media = 120 g",
  },
  {
    id: "seed-pera",
    name: "Pera",
    nutrients: f(57, 0.4, 15, 0.1, { sugars: 9.8, fiber: 3.1 }),
    defaultServingG: 150,
    servingLabel: "1 pera media = 150 g",
  },
  {
    id: "seed-arancia",
    name: "Arancia",
    nutrients: f(47, 0.9, 11.7, 0.1, { sugars: 9.4, fiber: 2.4 }),
    defaultServingG: 180,
    servingLabel: "1 arancia media = 180 g",
  },
  {
    id: "seed-mandarino",
    name: "Mandarino",
    nutrients: f(53, 0.8, 13.3, 0.3, { sugars: 10.6, fiber: 1.8 }),
    defaultServingG: 80,
    servingLabel: "1 mandarino = 80 g",
  },
  {
    id: "seed-kiwi",
    name: "Kiwi",
    nutrients: f(61, 1.1, 14.7, 0.5, { sugars: 9, fiber: 3 }),
    defaultServingG: 80,
    servingLabel: "1 kiwi = 80 g",
  },
  {
    id: "seed-fragole",
    name: "Fragole",
    nutrients: f(32, 0.7, 7.7, 0.3, { sugars: 4.9, fiber: 2 }),
  },
  {
    id: "seed-uva",
    name: "Uva",
    nutrients: f(69, 0.7, 18.1, 0.2, { sugars: 15.5, fiber: 0.9 }),
  },
  {
    id: "seed-pesca",
    name: "Pesca",
    nutrients: f(39, 0.9, 9.5, 0.3, { sugars: 8.4, fiber: 1.5 }),
    defaultServingG: 150,
    servingLabel: "1 pesca media = 150 g",
  },
  {
    id: "seed-albicocca",
    name: "Albicocca",
    nutrients: f(48, 1.4, 11.1, 0.4, { sugars: 9.2, fiber: 2 }),
    defaultServingG: 40,
    servingLabel: "1 albicocca = 40 g",
  },
  {
    id: "seed-ciliegie",
    name: "Ciliegie",
    nutrients: f(63, 1.1, 16, 0.2, { sugars: 12.8, fiber: 2.1 }),
  },
  {
    id: "seed-anguria",
    name: "Anguria",
    nutrients: f(30, 0.6, 7.6, 0.2, { sugars: 6.2, fiber: 0.4 }),
  },
  {
    id: "seed-melone",
    name: "Melone",
    nutrients: f(34, 0.8, 8.2, 0.2, { sugars: 7.9, fiber: 0.9 }),
  },
  {
    id: "seed-ananas",
    name: "Ananas",
    nutrients: f(50, 0.5, 13.1, 0.1, { sugars: 9.9, fiber: 1.4 }),
  },
  {
    id: "seed-mirtilli",
    name: "Mirtilli",
    nutrients: f(57, 0.7, 14.5, 0.3, { sugars: 10, fiber: 2.4 }),
  },
  {
    id: "seed-lamponi",
    name: "Lamponi",
    nutrients: f(52, 1.2, 11.9, 0.7, { sugars: 4.4, fiber: 6.5 }),
  },
  {
    id: "seed-avocado",
    name: "Avocado",
    nutrients: f(160, 2, 1.8, 14.7, { sugars: 0.7, saturatedFat: 2.1, fiber: 6.7 }),
    defaultServingG: 200,
    servingLabel: "1 avocado = 200 g",
  },
  {
    id: "seed-limone",
    name: "Limone",
    nutrients: f(29, 1.1, 9.3, 0.3, { sugars: 2.5, fiber: 2.8 }),
  },
  {
    id: "seed-prugne",
    name: "Prugne",
    nutrients: f(46, 0.7, 11.4, 0.3, { sugars: 9.9, fiber: 1.4 }),
  },
  {
    id: "seed-fichi-freschi",
    name: "Fichi freschi",
    nutrients: f(74, 0.8, 19.2, 0.3, { sugars: 16.3, fiber: 2.9 }),
  },
  {
    id: "seed-cachi",
    name: "Cachi",
    nutrients: f(70, 0.6, 18.6, 0.2, { sugars: 12.5, fiber: 3.6 }),
  },
  {
    id: "seed-datteri-secchi",
    name: "Datteri secchi",
    nutrients: f(282, 2.5, 75, 0.4, { sugars: 63, fiber: 8 }),
  },
  {
    id: "seed-albicocche-secche",
    name: "Albicocche secche",
    nutrients: f(241, 3.4, 63, 0.5, { sugars: 53, fiber: 7.3 }),
  },
  {
    id: "seed-uvetta",
    name: "Uvetta",
    nutrients: f(299, 3.1, 79, 0.5, { sugars: 59, fiber: 3.7 }),
  },

  // Frutta secca e semi
  {
    id: "seed-mandorle",
    name: "Mandorle",
    nutrients: f(603, 22, 4.6, 55.3, { sugars: 3.9, saturatedFat: 4.3, fiber: 12.7 }),
  },
  {
    id: "seed-noci",
    name: "Noci",
    nutrients: f(654, 15.2, 7, 65.2, { sugars: 2.6, saturatedFat: 6.1, fiber: 6.7 }),
  },
  {
    id: "seed-nocciole",
    name: "Nocciole",
    nutrients: f(628, 15, 7, 61, { sugars: 4.3, saturatedFat: 4.5, fiber: 9.7 }),
  },
  {
    id: "seed-pistacchi",
    name: "Pistacchi",
    nutrients: f(562, 20, 27.5, 45, { sugars: 7.7, saturatedFat: 5.5, fiber: 10.3, salt: 0.01 }),
  },
  {
    id: "seed-anacardi",
    name: "Anacardi",
    nutrients: f(553, 18.2, 30.2, 43.8, { sugars: 5.9, saturatedFat: 7.8, fiber: 3.3, salt: 0.01 }),
  },
  {
    id: "seed-arachidi",
    name: "Arachidi",
    nutrients: f(567, 25.8, 16.1, 49.2, { sugars: 4, saturatedFat: 6.3, fiber: 8.5, salt: 0.02 }),
  },
  {
    id: "seed-burro-arachidi",
    name: "Burro di arachidi",
    nutrients: f(588, 25, 20, 50, { sugars: 9, saturatedFat: 10, fiber: 6, salt: 0.4 }),
  },
  {
    id: "seed-pinoli",
    name: "Pinoli",
    nutrients: f(673, 13.7, 13.1, 68.4, { sugars: 3.6, saturatedFat: 4.9, fiber: 3.7 }),
  },
  {
    id: "seed-semi-chia",
    name: "Semi di chia",
    nutrients: f(486, 16.5, 42.1, 30.7, { sugars: 0, saturatedFat: 3.3, fiber: 34.4 }),
  },
  {
    id: "seed-semi-lino",
    name: "Semi di lino",
    nutrients: f(534, 18.3, 28.9, 42.2, { sugars: 1.6, saturatedFat: 3.7, fiber: 27.3 }),
  },
  {
    id: "seed-semi-zucca",
    name: "Semi di zucca",
    nutrients: f(559, 30.2, 10.7, 49, { sugars: 1.4, saturatedFat: 8.7, fiber: 6 }),
  },
  {
    id: "seed-semi-girasole",
    name: "Semi di girasole",
    nutrients: f(584, 20.8, 20, 51.5, { sugars: 2.6, saturatedFat: 4.5, fiber: 8.6 }),
  },
  {
    id: "seed-cocco-essiccato",
    name: "Cocco essiccato",
    nutrients: f(660, 6.9, 24, 64.5, { sugars: 7.4, saturatedFat: 57, fiber: 16.3, salt: 0.04 }),
  },

  // Oli e grassi
  {
    id: "seed-olio-extravergine-oliva",
    name: "Olio extravergine d'oliva",
    nutrients: f(899, 0, 0, 99.9, { saturatedFat: 14 }),
    isLiquid: true,
    defaultServingG: 10,
    servingLabel: "1 cucchiaio = 10 g",
  },
  {
    id: "seed-olio-semi-girasole",
    name: "Olio di semi di girasole",
    nutrients: f(899, 0, 0, 99.9, { saturatedFat: 11 }),
    isLiquid: true,
    defaultServingG: 10,
    servingLabel: "1 cucchiaio = 10 g",
  },
  {
    id: "seed-olio-cocco",
    name: "Olio di cocco",
    nutrients: f(892, 0, 0, 99.1, { saturatedFat: 82 }),
    isLiquid: true,
    defaultServingG: 10,
    servingLabel: "1 cucchiaio = 10 g",
  },
  {
    id: "seed-burro",
    name: "Burro",
    nutrients: f(758, 0.8, 1, 83.4, { sugars: 1, saturatedFat: 52, salt: 0.1 }),
    defaultServingG: 10,
    servingLabel: "1 noce di burro = 10 g",
  },
  {
    id: "seed-margarina",
    name: "Margarina vegetale",
    nutrients: f(720, 0.4, 0.4, 80, { saturatedFat: 20, salt: 0.8 }),
    defaultServingG: 10,
    servingLabel: "1 cucchiaino = 10 g",
  },
  {
    id: "seed-strutto",
    name: "Strutto",
    nutrients: f(891, 0, 0, 99, { saturatedFat: 39 }),
  },
  {
    id: "seed-maionese",
    name: "Maionese",
    nutrients: f(655, 1.1, 2, 71, { sugars: 1.5, saturatedFat: 6, salt: 1.2 }),
    defaultServingG: 15,
    servingLabel: "1 cucchiaio = 15 g",
  },

  // Dolci e snack
  {
    id: "seed-cioccolato-fondente-70",
    name: "Cioccolato fondente 70%",
    nutrients: f(598, 7.8, 45.9, 42.6, { sugars: 24, saturatedFat: 24.5, fiber: 10.9, salt: 0.02 }),
  },
  {
    id: "seed-cioccolato-al-latte",
    name: "Cioccolato al latte",
    nutrients: f(545, 7.6, 59.4, 30, { sugars: 51.5, saturatedFat: 18.5, fiber: 3.4, salt: 0.08 }),
  },
  {
    id: "seed-crema-nocciole",
    name: "Crema spalmabile alle nocciole",
    nutrients: f(539, 6.3, 57.5, 30.9, { sugars: 56.3, saturatedFat: 10.6, fiber: 3.4, salt: 0.1 }),
  },
  {
    id: "seed-biscotti-frollini",
    name: "Biscotti frollini",
    nutrients: f(460, 6.8, 68, 17, { sugars: 24, saturatedFat: 8, fiber: 2, salt: 0.5 }),
    defaultServingG: 8,
    servingLabel: "1 biscotto = 8 g",
  },
  {
    id: "seed-croissant-vuoto",
    name: "Croissant vuoto",
    nutrients: f(406, 7, 46, 21, { sugars: 12, saturatedFat: 11, fiber: 2, salt: 0.7 }),
    defaultServingG: 50,
    servingLabel: "1 croissant = 50 g",
  },
  {
    id: "seed-patatine-sacchetto",
    name: "Patatine in sacchetto",
    nutrients: f(536, 6.6, 49.7, 34.6, { sugars: 0.5, saturatedFat: 3.5, fiber: 4.4, salt: 1.5 }),
  },
  {
    id: "seed-gelato-crema",
    name: "Gelato alla crema",
    nutrients: f(207, 3.5, 24, 11, { sugars: 22, saturatedFat: 7, salt: 0.15 }),
  },
  {
    id: "seed-torta-margherita",
    name: "Torta margherita",
    nutrients: f(358, 6, 52, 13.5, { sugars: 28, saturatedFat: 6, fiber: 1, salt: 0.4 }),
  },
  {
    id: "seed-miele",
    name: "Miele",
    nutrients: f(304, 0.3, 80.3, 0, { sugars: 80.3, salt: 0.01 }),
  },
  {
    id: "seed-zucchero-bianco",
    name: "Zucchero bianco",
    nutrients: f(392, 0, 100, 0, { sugars: 100 }),
  },
  {
    id: "seed-marmellata-albicocche",
    name: "Marmellata di albicocche",
    nutrients: f(250, 0.4, 61, 0.2, { sugars: 55, fiber: 1, salt: 0.02 }),
  },
  {
    id: "seed-barretta-cereali",
    name: "Barretta ai cereali",
    nutrients: f(400, 6, 65, 12, { sugars: 25, saturatedFat: 5, fiber: 4, salt: 0.3 }),
    defaultServingG: 25,
    servingLabel: "1 barretta = 25 g",
  },

  // Bevande
  {
    id: "seed-acqua",
    name: "Acqua naturale",
    nutrients: f(0, 0, 0, 0),
    isLiquid: true,
    defaultServingG: 500,
    servingLabel: "1 bottiglietta = 500 ml",
  },
  {
    id: "seed-caffe-espresso",
    name: "Caffè espresso non zuccherato",
    nutrients: f(2, 0.1, 0.3, 0),
    isLiquid: true,
    defaultServingG: 30,
    servingLabel: "1 tazzina = 30 ml",
  },
  {
    id: "seed-te-verde",
    name: "Tè verde non zuccherato",
    nutrients: f(1, 0, 0.2, 0),
    isLiquid: true,
    defaultServingG: 250,
    servingLabel: "1 tazza = 250 ml",
  },
  {
    id: "seed-succo-arancia",
    name: "Succo d'arancia 100%",
    nutrients: f(45, 0.7, 10.4, 0.2, { sugars: 8.3, fiber: 0.2 }),
    isLiquid: true,
    defaultServingG: 200,
    servingLabel: "1 bicchiere = 200 ml",
  },
  {
    id: "seed-succo-mela",
    name: "Succo di mela 100%",
    nutrients: f(46, 0.1, 11.3, 0.1, { sugars: 9.6, fiber: 0.1 }),
    isLiquid: true,
    defaultServingG: 200,
    servingLabel: "1 bicchiere = 200 ml",
  },
  {
    id: "seed-bibita-cola",
    name: "Bibita gassata tipo cola",
    nutrients: f(42, 0, 10.6, 0, { sugars: 10.6, salt: 0.01 }),
    isLiquid: true,
    defaultServingG: 330,
    servingLabel: "1 lattina = 330 ml",
  },
  {
    id: "seed-bibita-cola-zero",
    name: "Bibita gassata tipo cola zero",
    nutrients: f(1, 0, 0, 0, { salt: 0.02 }),
    isLiquid: true,
    defaultServingG: 330,
    servingLabel: "1 lattina = 330 ml",
  },
  {
    id: "seed-bevanda-soia",
    name: "Bevanda di soia non zuccherata",
    nutrients: f(33, 3.3, 0.4, 1.8, { sugars: 0.4, saturatedFat: 0.3, fiber: 0.5, salt: 0.1 }),
    isLiquid: true,
    defaultServingG: 200,
    servingLabel: "1 bicchiere = 200 ml",
  },
  {
    id: "seed-bevanda-mandorla",
    name: "Bevanda di mandorla non zuccherata",
    nutrients: f(13, 0.5, 0.1, 1.1, { saturatedFat: 0.1, fiber: 0.4, salt: 0.1 }),
    isLiquid: true,
    defaultServingG: 200,
    servingLabel: "1 bicchiere = 200 ml",
  },
  {
    id: "seed-bevanda-riso",
    name: "Bevanda di riso",
    nutrients: f(47, 0.3, 9.5, 1, { sugars: 5, saturatedFat: 0.1, salt: 0.1 }),
    isLiquid: true,
    defaultServingG: 200,
    servingLabel: "1 bicchiere = 200 ml",
  },
  {
    id: "seed-te-freddo-limone",
    name: "Tè freddo al limone",
    nutrients: f(28, 0, 7, 0, { sugars: 7, salt: 0.01 }),
    isLiquid: true,
    defaultServingG: 330,
    servingLabel: "1 lattina = 330 ml",
  },
];
