// Test del calcolatore con ricevute reali: l'incasso calcolato deve coincidere
// con quello pagato davvero dalla piattaforma (tolleranza 2 centesimi).
// I tassi vengono dai file in data/, come sul sito.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { computeRows, VOCI, type Piattaforma, type Risultato, type Stato } from '../src/lib/calcolo';
import { costruisciTassi, type DatiAnimali, type DatiCommissione } from '../src/lib/tassi';

const leggi = (percorso: string) => parse(readFileSync(new URL(`../data/${percorso}`, import.meta.url), 'utf8'));
const iva: number = leggi('fisco/aliquote.yaml').iva.valore;
const animali = leggi('supplementi/animali.yaml') as DatiAnimali;
const tassi = costruisciTassi((id) => leggi(`commissioni/${id}.yaml`) as DatiCommissione, iva, animali);

const TOLLERANZA = 0.02;

/** Scelte di partenza; ogni test cambia solo quello che gli serve. */
function stato(modifiche: Partial<Stato>): Stato {
  return {
    ab: 'single', abCustom: NaN, vr: 'ppb', vrCustom: NaN, iva: 'priv', tax: 0.21,
    ref: 'airbnb', price: 700, cleaning: 320, pet: 0,
    ...modifiche,
  };
}

function calcola(s: Stato): Risultato {
  const r = computeRows(s, tassi);
  if (!r) throw new Error('Il calcolatore non ha dato un risultato');
  return r;
}

const riga = (r: Risultato, id: Piattaforma) => r.rows.find((x) => x.id === id)!;

/** Netto di un soggiorno intero: il calcolatore lavora per notte, la ricevuta per soggiorno. */
const nettoSoggiorno = (r: Risultato, id: Piattaforma, notti: number) =>
  riga(r, id).voci.notte.net * notti + riga(r, id).voci.pulizia.net;

describe('ricevute reali', () => {
  test('Airbnb, commissione condivisa 3% + IVA, ritenuta 21%: 14 notti a 665 €, pulizia 320 €', () => {
    const r = calcola(stato({ ab: 'split', ref: 'airbnb', price: 665, cleaning: 320 }));
    expect(Math.abs(nettoSoggiorno(r, 'airbnb', 14) - 7255.24)).toBeLessThanOrEqual(TOLLERANZA);
  });

  test('Vrbo, modello precedente 5% + 3% + IVA, ritenuta 21%: 8 notti a 250 €, pulizia 300 €', () => {
    const r = calcola(stato({ vr: 'old', ref: 'vrbo', price: 250, cleaning: 300 }));
    expect(Math.abs(nettoSoggiorno(r, 'vrbo', 8) - 1592.53)).toBeLessThanOrEqual(TOLLERANZA);
  });
});

describe('parità tra le piattaforme', () => {
  // Airbnb commissione unica e Vrbo 12%, privato, ritenuta 21%, supplemento animali 50 €.
  for (const ref of ['airbnb', 'vrbo'] as const) {
    test(`partendo da ${ref}: notte, pulizia e animali danno lo stesso netto`, () => {
      const r = calcola(stato({ ref, pet: 50 }));
      const altra = riga(r, ref === 'airbnb' ? 'vrbo' : 'airbnb');
      for (const v of VOCI) {
        const partenza = riga(r, ref).voci[v];
        const quota = altra.voci[v].net / altra.voci[v].value;

        // Con l'importo esatto (non arrotondato) il netto è identico al centesimo.
        expect(Math.abs(altra.voci[v].exact * quota - partenza.net)).toBeLessThanOrEqual(TOLLERANZA);
        expect(Math.abs(r.netti[v] - partenza.net)).toBeLessThanOrEqual(TOLLERANZA);

        // Arrotondando all'euro per eccesso si incassa un po' di più, mai più di 1 € lordo.
        const differenza = altra.voci[v].net - partenza.net;
        expect(differenza).toBeGreaterThanOrEqual(-TOLLERANZA);
        expect(differenza).toBeLessThanOrEqual(quota);
      }
    });
  }
});

describe('supplemento animali', () => {
  test('si converte come il prezzo a notte, perché entrambe le piattaforme ci applicano la commissione', () => {
    const vrbo = riga(calcola(stato({ pet: 50 })), 'vrbo').voci;
    expect(vrbo.animali.exact / 50).toBeCloseTo(vrbo.notte.exact / 700, 10);
    expect(vrbo.animali.value).toBe(47);
  });

  test('senza supplemento resta 0 su entrambe le piattaforme', () => {
    const r = calcola(stato({ pet: 0 }));
    expect(riga(r, 'airbnb').voci.animali.value).toBe(0);
    expect(riga(r, 'vrbo').voci.animali.value).toBe(0);
  });
});

describe('esempio della guida (passo 6.3)', () => {
  test('700 € a notte su Airbnb e 320 € di pulizia: su Vrbo 654 € a notte e 299 € di pulizia', () => {
    const vrbo = riga(calcola(stato({})), 'vrbo');
    expect(vrbo.voci.notte.value).toBe(654);
    expect(vrbo.voci.pulizia.value).toBe(299);
  });
});
