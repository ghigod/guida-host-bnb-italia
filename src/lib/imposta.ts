// Funzioni per mostrare i dati dell'imposta di soggiorno nelle pagine.
// Nessun numero fiscale qui: arrivano tutti da data/imposta-soggiorno/.
import type { ImpostaSoggiorno } from './schema-imposta';

type Categoria = ImpostaSoggiorno['tariffe'][number]['categoria'];
type Riscossione = ImpostaSoggiorno['riscossione']['airbnb']['valore'];

export const NOME_CATEGORIA: Record<Categoria, string> = {
  locazione_turistica: 'Locazione turistica (affitto breve)',
  casa_vacanze: 'Casa vacanze',
  bnb: 'B&B',
  affittacamere: 'Affittacamere',
};

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** "04-01" diventa "1° aprile". */
export function giornoLeggibile(mmgg: string): string {
  const [mese, giorno] = mmgg.split('-').map(Number);
  return `${giorno === 1 ? '1°' : giorno} ${MESI[mese - 1]}`;
}

/** { dal: "04-01", al: "10-31" } diventa "dal 1° aprile al 31 ottobre". */
export function periodoLeggibile(p: { dal: string; al: string }): string {
  return `dal ${giornoLeggibile(p.dal)} al ${giornoLeggibile(p.al)}`;
}

/** Data in formato italiano: "28 ottobre 2026", "1° febbraio 2025". */
export function dataLunga(d: Date): string {
  const testo = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return d.getUTCDate() === 1 ? testo.replace(/^1 /, '1° ') : testo;
}

/** Importo in euro con due decimali: 6 diventa "6,00 €", 1234.5 diventa "1.234,50 €". */
export function euro(x: number): string {
  return x.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
}

/**
 * Le tariffe da mettere in evidenza: quelle delle locazioni turistiche, il caso più comune per
 * gli host privati. Se il comune non le distingue, quelle della prima categoria del file.
 * Una riga per stagione (o una sola, se la tariffa è unica).
 */
export function tariffePrincipali(d: ImpostaSoggiorno): { categoria: Categoria; stagione?: string; importo: number }[] {
  const categoria = d.tariffe.some((t) => t.categoria === 'locazione_turistica') ? 'locazione_turistica' : d.tariffe[0].categoria;
  const righe = d.tariffe.filter((t) => t.categoria === categoria);
  // Più righe della stessa categoria e stagione (es. imprenditoriali e non): se l'importo è uguale, ne basta una.
  const viste = new Map<string, { categoria: Categoria; stagione?: string; importo: number }>();
  for (const t of righe) {
    const chiave = `${t.stagione ?? ''}|${t.importo}`;
    if (!viste.has(chiave)) viste.set(chiave, { categoria, stagione: t.stagione, importo: t.importo });
  }
  return [...viste.values()];
}

/** La tariffa principale in breve: "6,00 €" oppure "da 2,00 a 5,00 €". */
export function tariffaInBreve(d: ImpostaSoggiorno): string {
  const importi = tariffePrincipali(d).map((t) => t.importo);
  const min = Math.min(...importi), max = Math.max(...importi);
  return min === max ? euro(min) : `da ${euro(min)} a ${euro(max)}`;
}

/** Notti su cui si paga davvero, tenendo conto del massimo del comune. */
export function nottiTassate(notti: number, d: ImpostaSoggiorno): number {
  const max = d.notti_massime.valore;
  return typeof max === 'number' ? Math.min(notti, max) : notti;
}

/** Le eccezioni al massimo di notti, in parole: "B&B e affittacamere: nessun limite". */
export function eccezioniNotti(d: ImpostaSoggiorno): string[] {
  return d.notti_massime.eccezioni.map((e) => {
    const nomi = e.categorie.map((c) => NOME_CATEGORIA[c]).join(' e ');
    const v = typeof e.valore === 'number' ? `al massimo ${e.valore} notti` : e.valore === 'nessun_limite' ? 'nessun limite' : 'massimo non indicato nelle fonti';
    return `${nomi}: ${v}`;
  });
}

/** Esempio di calcolo: persone × notti tassate × tariffa. */
export function esempio(d: ImpostaSoggiorno, importo: number, persone: number, notti: number) {
  const tassate = nottiTassate(notti, d);
  return { persone, notti, tassate, importo, totale: persone * tassate * importo };
}

/** Cosa vuol dire, per l'host, il modo in cui la piattaforma tratta l'imposta. */
export function testoRiscossione(piattaforma: 'Airbnb' | 'Vrbo', v: Riscossione): string {
  if (v === 'riscuote_e_versa') return `${piattaforma} fa pagare l'imposta all'ospite e la versa al Comune per te.`;
  if (v === 'no') return `${piattaforma} non la riscuote: la chiedi tu all'ospite e la versi tu al Comune.`;
  return `Non abbiamo trovato una fonte ufficiale: chiedi all'ufficio del Comune.`;
}
