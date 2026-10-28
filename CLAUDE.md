# Guida Host BnB Italia

## Cos'è

Sito in italiano per host di affitti brevi in Italia:

- calcolatore del prezzo equivalente tra Airbnb e Vrbo;
- commissioni per caso;
- imposta di soggiorno per comune;
- guida agli adempimenti.

Pubblico: host privati, non tecnici.

## Chi lavora qui

Il proprietario non è un programmatore.

- Spiega le scelte in parole semplici.
- Proponi un piano prima delle modifiche grandi.
- Chiedi conferma prima di cancellare file o cambiare la struttura.

## Regole sui dati (le più importanti)

- Ogni numero fiscale o commissione sta in `data/`, mai scritto nelle pagine.
- Ogni voce ha: valore, `fonte` (URL ufficiale), `verificato_il` (data), `valida_dal`.
- Fonti accettate: siti ufficiali di piattaforme, comuni, regioni, Agenzia delle Entrate,
  Gazzetta Ufficiale. Articoli di giornale solo come supporto.
- Se un dato non è certo, scrivilo nel campo `note` e segnalalo. Mai inventare.
- Le modifiche ai dati passano sempre da una pull request, mai direttamente.

## Flusso per l'imposta di soggiorno (un comune alla volta)

1. Agente `ricercatore-imposta`: compila `data/imposta-soggiorno/<comune>.yaml` in `stato: bozza`.
2. Agente `verificatore-dati`: controlla ogni valore sulle fonti, senza vedere il lavoro del primo.
3. Il proprietario guarda le righe DIVERSO / NON TROVATO e apre almeno la delibera.
4. Solo lui decide il passaggio a `stato: verificato`. Pull request, poi merge.

## Codice

- Astro + TypeScript, sito statico.
- La logica del calcolatore sta in `src/lib/calcolo.ts` ed è coperta da test.
- Prima di ogni commit: esegui i test e la build. Se falliscono, non salvare.

## Stile dei testi

- Italiano semplice, frasi brevi, voce attiva. Niente gergo senza spiegazione.
- Importi in euro con la virgola decimale (es. 1.234,56 €).

## Cose da non fare mai

- Non mettere "Airbnb" o "Vrbo" nel nome del sito o nei loghi.
- Non dare consigli fiscali personali: rimanda sempre alle fonti.
- Non mettere dati personali (nomi, indirizzi, ricevute) nei file del progetto.
