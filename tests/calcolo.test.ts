// Test del calcolatore con ricevute reali: l'incasso calcolato deve coincidere
// con quello pagato davvero dalla piattaforma (tolleranza 2 centesimi).
// I tassi vengono dai file in data/, come sul sito.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { computeRows, type Piattaforma, type Risultato, type Stato } from '../src/lib/calcolo';
import { costruisciTassi, type DatiCommissione } from '../src/lib/tassi';

const leggi = (percorso: string) => parse(readFileSync(new URL(`../data/${percorso}`, import.meta.url), 'utf8'));
const iva: number = leggi('fisco/aliquote.yaml').iva.valore;
const tassi = costruisciTassi((id) => leggi(`commissioni/${id}.yaml`) as DatiCommissione, iva);

const TOLLERANZA = 0.02;

/** Scelte di partenza; ogni test cambia solo quello che gli serve. */
function stato(modifiche: Partial<Stato>): Stato {
  return {
    ab: 'single', abCustom: NaN, vr: 'ppb', vrCustom: NaN, iva: 'priv', tax: 0.21,
    ref: 'airbnb', price: 700, cleaning: 320, nights: 7, mode: 'prop',
    ...modifiche,
  };
}

function calcola(s: Stato): Risultato {
  const r = computeRows(s, tassi);
  if (!r) throw new Error('Il calcolatore non ha dato un risultato');
  return r;
}

const riga = (r: Risultato, id: Piattaforma) => r.rows.find((x) => x.id === id)!;

describe('ricevute reali', () => {
  test('Airbnb, commissione condivisa 3% + IVA, ritenuta 21%: 14 notti a 665 €, pulizia 320 €', () => {
    const r = calcola(stato({ ab: 'split', ref: 'airbnb', price: 665, nights: 14, cleaning: 320 }));
    expect(Math.abs(riga(r, 'airbnb').net - 7255.24)).toBeLessThanOrEqual(TOLLERANZA);
  });

  test('Vrbo, modello precedente 5% + 3% + IVA, ritenuta 21%: 8 notti a 250 €, pulizia 300 €', () => {
    const r = calcola(stato({ vr: 'old', ref: 'vrbo', price: 250, nights: 8, cleaning: 300 }));
    expect(Math.abs(riga(r, 'vrbo').net - 1592.53)).toBeLessThanOrEqual(TOLLERANZA);
  });
});

describe('parità tra le piattaforme', () => {
  // Airbnb commissione unica e Vrbo 12%, privato, ritenuta 21%.
  for (const ref of ['airbnb', 'vrbo'] as const) {
    for (const mode of ['prop', 'night'] as const) {
      test(`partendo da ${ref}, ${mode === 'prop' ? 'notte e pulizia in proporzione' : 'solo prezzo a notte'}: stesso incasso netto`, () => {
        const r = calcola(stato({ ref, mode }));
        const partenza = riga(r, ref);
        const altra = riga(r, ref === 'airbnb' ? 'vrbo' : 'airbnb');
        const quota = 1 - altra.fee - r.t;

        // Con i prezzi esatti (non arrotondati) l'incasso è identico al centesimo.
        const nettoEsatto = (altra.exact * r.n + altra.cleaningExact) * quota;
        expect(Math.abs(nettoEsatto - partenza.net)).toBeLessThanOrEqual(TOLLERANZA);

        // Con i prezzi arrotondati all'euro (per eccesso) si incassa un po' di più,
        // ma mai più di 1 € a notte e 1 € di pulizia.
        const differenza = altra.net - partenza.net;
        expect(differenza).toBeGreaterThanOrEqual(-TOLLERANZA);
        expect(differenza).toBeLessThanOrEqual((r.n + 1) * quota);
      });
    }
  }
});

describe('esempio della guida (passo 6.3)', () => {
  test('700 € a notte su Airbnb, 320 € di pulizia, 7 notti: su Vrbo 654 € a notte e 299 € di pulizia', () => {
    const vrbo = riga(calcola(stato({})), 'vrbo');
    expect(vrbo.price).toBe(654);
    expect(vrbo.cleaning).toBe(299);
  });
});
