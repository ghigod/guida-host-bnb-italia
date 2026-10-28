// Test delle funzioni che preparano i dati dell'imposta di soggiorno per le pagine.
// Usano il comune inventato di tests/esempi/: alta 2 €, bassa 1 €, massimo 7 notti.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { dataLunga, esempio, euro, giornoLeggibile, nottiTassate, periodoLeggibile, tariffaInBreve, tariffePrincipali } from '../src/lib/imposta';
import { schemaImposta } from '../src/lib/schema-imposta';

/** Il browser separa numero e € con uno spazio che non va a capo: qui lo trattiamo come uno spazio normale. */
const spazi = (s: string) => s.replace(/\u00a0/g, ' ');

const comune = () =>
  schemaImposta.parse(parse(readFileSync(new URL('./esempi/imposta-comune-inventato.yaml', import.meta.url), 'utf8')));

describe('date e importi leggibili', () => {
  test('giorni e periodi', () => {
    expect(giornoLeggibile('04-01')).toBe('1° aprile');
    expect(giornoLeggibile('10-31')).toBe('31 ottobre');
    expect(periodoLeggibile({ dal: '11-01', al: '03-31' })).toBe('dal 1° novembre al 31 marzo');
  });

  test('date lunghe, con il primo del mese scritto 1°', () => {
    expect(dataLunga(new Date('2026-10-28'))).toBe('28 ottobre 2026');
    expect(dataLunga(new Date('2025-02-01'))).toBe('1° febbraio 2025');
  });

  test('euro con la virgola e il punto delle migliaia', () => {
    expect(spazi(euro(6))).toBe('6,00 €');
    expect(spazi(euro(1234.5))).toBe('1.234,50 €');
  });
});

describe('tariffe in evidenza', () => {
  test('una riga per stagione, per le locazioni turistiche', () => {
    expect(tariffePrincipali(comune())).toEqual([
      { categoria: 'locazione_turistica', stagione: 'alta', importo: 2 },
      { categoria: 'locazione_turistica', stagione: 'bassa', importo: 1 },
    ]);
    expect(spazi(tariffaInBreve(comune()))).toBe('da 1,00 € a 2,00 €');
  });

  test('righe uguali (es. imprenditoriali e non) contano una volta sola', () => {
    const d = comune();
    d.stagioni = [];
    d.tariffe = [
      { ...d.tariffe[0], stagione: undefined, importo: 6 },
      { ...d.tariffe[0], stagione: undefined, importo: 6, nome_nel_documento: 'Altro nome' },
    ];
    expect(tariffePrincipali(d)).toHaveLength(1);
    expect(spazi(tariffaInBreve(d))).toBe('6,00 €');
  });
});

describe('notti tassate ed esempio di calcolo', () => {
  test('oltre il massimo di notti non si paga', () => {
    expect(nottiTassate(3, comune())).toBe(3);
    expect(nottiTassate(10, comune())).toBe(7);
  });

  test('senza limite si pagano tutte le notti', () => {
    const d = comune();
    d.notti_massime = { valore: 'nessun_limite' };
    expect(nottiTassate(10, d)).toBe(10);
  });

  test('4 persone per 3 notti a 2 €: 24 €', () => {
    expect(esempio(comune(), 2, 4, 3)).toEqual({ persone: 4, notti: 3, tassate: 3, importo: 2, totale: 24 });
  });
});
