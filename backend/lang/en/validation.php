<?php

/*
 * Solo la chiave che ci serve davvero: il resto lo risolve gia' bene
 * l'inglese di serie di Laravel (vendor/laravel/framework/.../lang/en), e
 * Laravel lo consulta comunque per ogni chiave assente da qui - non serve
 * copiarlo tutto (visto in lang/it/validation.php).
 *
 * 'required' senza `:attribute`, come in lang/it/validation.php: ogni campo
 * vuoto dice la stessa cosa, e la app la mostra una volta sola quando piu' di
 * un campo e' vuoto insieme (vedi `App\Support\ValidationMessage`) - cosa che
 * non potrebbe fare se ogni campo dicesse "the handle field..."/"the email
 * field..." con testo diverso.
 */
return [
    'required' => 'This field is required.',
];
