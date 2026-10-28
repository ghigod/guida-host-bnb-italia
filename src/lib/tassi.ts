// Trasforma i file di dati delle commissioni nei tassi che usa il calcolatore.
// Lo usano sia la pagina sia i test, così i test controllano gli stessi numeri del sito.
import type { Caso, Tassi } from './calcolo';

/** Quello che serve al calcolatore da un file in data/commissioni/. */
export interface DatiCommissione {
  caso: string;
  commissione: number;
  fino_a?: boolean;
  componenti?: { voce: string; percentuale: number }[];
  costo_ospite:
    | { tipo: 'nessuno' }
    | { tipo: 'percentuale'; valore: string }
    | { tipo: 'variabile'; dettaglio: string };
}

/** Il nome del file (senza .yaml) di ogni caso usato dal calcolatore. */
export const FILE_COMMISSIONI = {
  airbnbUnica: 'airbnb-commissione-unica',
  airbnbCondivisa: 'airbnb-commissione-condivisa',
  vrboPrenotazione: 'vrbo-a-prenotazione',
  vrboProfessional: 'vrbo-professional-regionale',
  vrboPrecedente: 'vrbo-modello-precedente',
} as const;

/** Numero in formato italiano: 15.5 diventa "15,5". */
export const numero = (x: number) => x.toLocaleString('it-IT');

/** La commissione come si legge: "15,5%", "5% + 3%", "fino a 15%". */
export function testoCommissione(d: DatiCommissione): string {
  if (d.componenti) return d.componenti.map((c) => numero(c.percentuale) + '%').join(' + ');
  return (d.fino_a ? 'fino a ' : '') + numero(d.commissione) + '%';
}

function ospiteBreve(d: DatiCommissione): string | null {
  const o = d.costo_ospite;
  return o.tipo === 'nessuno' ? null : o.tipo === 'percentuale' ? o.valore : 'variabile';
}

function perCalcolo(d: DatiCommissione): Caso {
  return { percentuale: d.commissione, label: `${d.caso} ${testoCommissione(d)}`, guest: ospiteBreve(d) };
}

/**
 * @param trova restituisce i dati di un file di data/commissioni/ dato il suo nome
 * @param iva aliquota IVA in punti (22 = 22%)
 */
export function costruisciTassi(trova: (id: string) => DatiCommissione, iva: number): Tassi {
  const f = FILE_COMMISSIONI;
  const abUnica = trova(f.airbnbUnica);
  return {
    iva,
    airbnb: {
      single: perCalcolo(abUnica),
      split: perCalcolo(trova(f.airbnbCondivisa)),
      custom: { percentuale: abUnica.commissione, label: '', guest: null },
    },
    vrbo: {
      ppb: perCalcolo(trova(f.vrboPrenotazione)),
      old: perCalcolo(trova(f.vrboPrecedente)),
      custom: perCalcolo(trova(f.vrboProfessional)),
    },
  };
}
