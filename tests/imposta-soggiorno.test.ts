// Test dello schema dell'imposta di soggiorno: ogni file vero in data/imposta-soggiorno/
// deve rispettarlo, e lo schema deve davvero bloccare gli errori più probabili.
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { schemaImposta } from '../src/lib/schema-imposta';

const cartella = new URL('../data/imposta-soggiorno/', import.meta.url);
const fileComuni = readdirSync(cartella).filter((f) => f.endsWith('.yaml'));
const leggi = (url: URL) => parse(readFileSync(url, 'utf8'));

/** Messaggi d'errore dello schema, uno per riga, per capire subito cosa non va. */
function errori(dati: unknown): string[] {
  const r = schemaImposta.safeParse(dati);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('i file dei comuni rispettano lo schema', () => {
  test.skipIf(fileComuni.length > 0)('ancora nessun comune in data/imposta-soggiorno/', () => {});

  for (const f of fileComuni) {
    test(f, () => {
      expect(errori(leggi(new URL(f, cartella)))).toEqual([]);
    });
  }
});

describe('lo schema blocca gli errori', () => {
  // Un comune inventato e corretto: ogni test ci introduce un solo errore.
  const esempio = () => leggi(new URL('./esempi/imposta-comune-inventato.yaml', import.meta.url));

  test('il comune di prova è valido', () => {
    expect(errori(esempio())).toEqual([]);
  });

  test('un rif che punta a una fonte inesistente', () => {
    const d = esempio();
    d.tariffe[0].rif.fonte = 'giornale';
    expect(errori(d).join('\n')).toContain('La fonte "giornale" non è tra le fonti del file');
  });

  test('manca la pagina ufficiale del comune', () => {
    const d = esempio();
    delete d.fonti.pagina_comune;
    d.riscossione.rif.fonte = 'delibera';
    expect(errori(d).join('\n')).toContain('pagina_comune');
  });

  test('mancano sia la delibera sia il regolamento', () => {
    const d = esempio();
    delete d.fonti.delibera;
    delete d.fonti.regolamento;
    expect(errori(d).join('\n')).toContain('Serve almeno la fonte "delibera" o "regolamento"');
  });

  test('una tariffa per alberghi, che non raccogliamo', () => {
    const d = esempio();
    d.tariffe[0].categoria = 'albergo_3_stelle';
    expect(errori(d).length).toBeGreaterThan(0);
  });

  test('una tariffa senza rif', () => {
    const d = esempio();
    delete d.tariffe[0].rif;
    expect(errori(d).length).toBeGreaterThan(0);
  });

  test('manca la data di verifica', () => {
    const d = esempio();
    delete d.verificato_il;
    expect(errori(d).join('\n')).toContain('verificato_il');
  });

  test('provincia scritta per esteso invece della sigla', () => {
    const d = esempio();
    d.provincia = 'Firenze';
    expect(errori(d).join('\n')).toContain('sigla di due lettere');
  });

  test('notti massime "non_trovato": va bene in bozza, non in un comune verificato', () => {
    const d = esempio();
    d.notti_massime = { valore: 'non_trovato' };
    expect(errori(d)).toEqual([]);
    d.stato = 'verificato';
    expect(errori(d).join('\n')).toContain('non può avere le notti massime "non_trovato"');
  });

  test('notti massime senza rif', () => {
    const d = esempio();
    delete d.notti_massime.rif;
    expect(errori(d).join('\n')).toContain('Serve il rif');
  });

  test('una tariffa che richiama una stagione inesistente', () => {
    const d = esempio();
    d.tariffe[0].stagione = 'estate';
    expect(errori(d).join('\n')).toContain('La stagione "estate" non è tra le stagioni del file');
  });

  test('con più stagioni, una tariffa senza stagione', () => {
    const d = esempio();
    delete d.tariffe[1].stagione;
    expect(errori(d).join('\n')).toContain('indica a quale si riferisce la tariffa');
  });

  test('una data di stagione scritta male', () => {
    const d = esempio();
    d.stagioni[0].periodi[0].dal = '1 aprile';
    expect(errori(d).join('\n')).toContain('formato MM-GG');
  });

  test('un comune senza stagioni, con tariffa unica', () => {
    const d = esempio();
    d.stagioni = [];
    d.tariffe = [{ ...d.tariffe[0], stagione: undefined }];
    expect(errori(d)).toEqual([]);
  });

  test('stato diverso da bozza o verificato', () => {
    const d = esempio();
    d.stato = 'pubblicato';
    expect(errori(d).length).toBeGreaterThan(0);
  });
});
