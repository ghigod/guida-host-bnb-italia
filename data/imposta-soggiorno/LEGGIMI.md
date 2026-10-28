# Imposta di soggiorno

Un file per comune, chiamato con il nome del comune in minuscolo e con i trattini
(es. `firenze.yaml`, `castiglione-della-pescaia.yaml`).

- Lo schema (i campi obbligatori e le regole) è in `src/lib/schema-imposta.ts`.
- Ogni valore ha un `rif`: da quale fonte del file viene e da quale punto (articolo, comma).
- Un comune nasce in `stato: bozza` e diventa `verificato` solo dopo il controllo
  dell'agente verificatore-dati e del proprietario del sito. Le bozze non vanno online.
- Le modifiche passano sempre da una pull request.
