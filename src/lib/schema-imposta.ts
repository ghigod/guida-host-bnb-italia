// Schema dei file data/imposta-soggiorno/<comune>.yaml: un file per comune.
// Lo usano sia la build (src/content.config.ts) sia i test, così le regole sono le stesse.
// Ogni valore ha un "rif" che dice da quale fonte del file viene e da quale punto.
import { z } from 'astro/zod';

const fonte = z.object({
  titolo: z.string().min(1),
  url: z.url(),
  /** false solo per fonti di supporto (articoli, siti non istituzionali). */
  ufficiale: z.boolean().default(true),
});

/** Da dove viene un valore: il nome di una voce di "fonti" e il punto preciso (es. "art. 3, comma 1"). */
const rif = z.object({
  fonte: z.string().min(1),
  punto: z.string().min(1),
});

/** Giorno dell'anno senza l'anno: "04-01" è il 1° aprile. */
const giorno = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Data nel formato MM-GG, es. "04-01" per il 1° aprile');

/** Solo le strutture che interessano agli host privati: niente alberghi. */
export const CATEGORIE = ['locazione_turistica', 'casa_vacanze', 'bnb', 'affittacamere'] as const;

/** Notti massime: un numero, nessun limite, oppure non trovato (per non inventare). */
const valoreNotti = z.union([z.number().int().min(1).max(365), z.literal('nessun_limite'), z.literal('non_trovato')]);

/** Se la piattaforma riscuote e versa l'imposta al posto dell'host. */
export const RISCOSSIONE = ['riscuote_e_versa', 'no', 'non_verificato'] as const;

export const schemaImposta = z
  .object({
    comune: z.string().min(1),
    /** Sigla della provincia, es. FI. */
    provincia: z.string().regex(/^[A-Z]{2}$/, 'La provincia è la sigla di due lettere maiuscole, es. FI'),
    regione: z.string().min(1),
    /** Anno delle tariffe. */
    anno: z.number().int().min(2000).max(2100),
    valida_dal: z.coerce.date(),
    /** Solo i comuni "verificato" diventano pagine del sito. */
    stato: z.enum(['bozza', 'verificato']),

    /**
     * Facoltativo: solo se le tariffe cambiano durante l'anno.
     * Ogni stagione ha uno o più intervalli di date; un intervallo può scavalcare l'anno (es. dal 11-01 al 03-31).
     */
    stagioni: z
      .array(
        z.object({
          /** Es. alta, bassa. Le tariffe la richiamano con "stagione". */
          nome: z.string().min(1),
          periodi: z.array(z.object({ dal: giorno, al: giorno })).min(1),
          rif,
        }),
      )
      .default([]),

    /** Le fonti del file, per nome. Servono almeno la pagina del comune e la delibera o il regolamento. */
    fonti: z.record(z.string(), fonte),

    tariffe: z
      .array(
        z.object({
          categoria: z.enum(CATEGORIE),
          /** Come la chiama la delibera. */
          nome_nel_documento: z.string().min(1),
          /** Euro per persona per notte. */
          importo: z.number().min(0).max(50),
          /** Il nome di una delle "stagioni", se la tariffa vale solo in un periodo dell'anno. */
          stagione: z.string().optional(),
          /** Facoltativo: es. centro storico. */
          zona: z.string().optional(),
          rif,
        }),
      )
      .min(1),

    /**
     * Oltre questo numero di notti consecutive non si paga più.
     * "non_trovato" serve a non inventare: si spiega in note e il comune resta in bozza.
     */
    notti_massime: z.object({
      valore: valoreNotti,
      rif: rif.optional(),
      /** Facoltativo: tipi di struttura con un massimo diverso (es. B&B senza limite). */
      eccezioni: z
        .array(z.object({ categorie: z.array(z.enum(CATEGORIE)).min(1), valore: valoreNotti, rif }))
        .default([]),
    }),

    esenzioni: z
      .array(
        z.object({
          descrizione: z.string().min(1),
          /** Solo se l'esenzione è un limite di età: esenti fino a questa età compresa. */
          eta_fino_a: z.number().int().min(0).max(120).optional(),
          rif,
        }),
      )
      .default([]),

    riduzioni: z
      .array(
        z.object({
          descrizione: z.string().min(1),
          /** Sconto sulla tariffa, in punti (50 = metà). */
          percentuale: z.number().min(0).max(100),
          rif,
        }),
      )
      .default([]),

    /** Per ogni piattaforma, con la sua fonte: spesso Airbnb e Vrbo hanno fonti diverse. */
    riscossione: z.object({
      airbnb: z.object({ valore: z.enum(RISCOSSIONE), rif: rif.optional() }),
      vrbo: z.object({ valore: z.enum(RISCOSSIONE), rif: rif.optional() }),
    }),

    scadenze: z
      .array(
        z.object({
          /** Es. versamento, comunicazione al comune. */
          cosa: z.string().min(1),
          /** Es. entro il 16 del mese successivo. */
          quando: z.string().min(1),
          rif,
        }),
      )
      .default([]),

    verificato_il: z.coerce.date(),
    /** Dubbi, dati mancanti, fonti in contrasto. */
    note: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.fonti.pagina_comune) {
      ctx.addIssue({ code: 'custom', path: ['fonti'], message: 'Manca la fonte "pagina_comune" (la pagina ufficiale del comune)' });
    }
    if (!d.fonti.delibera && !d.fonti.regolamento) {
      ctx.addIssue({ code: 'custom', path: ['fonti'], message: 'Serve almeno la fonte "delibera" o "regolamento"' });
    }
    // Ogni rif deve puntare a una fonte che esiste davvero nel file.
    const controlla = (r: { fonte: string }, path: (string | number)[]) => {
      if (!d.fonti[r.fonte]) {
        ctx.addIssue({ code: 'custom', path: [...path, 'rif', 'fonte'], message: `La fonte "${r.fonte}" non è tra le fonti del file` });
      }
    };
    d.stagioni.forEach((st, i) => controlla(st.rif, ['stagioni', i]));
    const nomiStagioni = d.stagioni.map((st) => st.nome);
    if (new Set(nomiStagioni).size !== nomiStagioni.length) {
      ctx.addIssue({ code: 'custom', path: ['stagioni'], message: 'Due stagioni con lo stesso nome' });
    }
    d.tariffe.forEach((t, i) => {
      controlla(t.rif, ['tariffe', i]);
      if (t.stagione && !nomiStagioni.includes(t.stagione)) {
        ctx.addIssue({ code: 'custom', path: ['tariffe', i, 'stagione'], message: `La stagione "${t.stagione}" non è tra le stagioni del file` });
      }
    });
    // Se ci sono stagioni, ogni tariffa deve dire a quale si riferisce: niente tariffe ambigue.
    if (d.stagioni.length > 0) {
      d.tariffe.forEach((t, i) => {
        if (!t.stagione) ctx.addIssue({ code: 'custom', path: ['tariffe', i, 'stagione'], message: 'Il comune ha più stagioni: indica a quale si riferisce la tariffa' });
      });
    }
    if (d.notti_massime.valore === 'non_trovato') {
      if (d.stato === 'verificato') {
        ctx.addIssue({ code: 'custom', path: ['notti_massime'], message: 'Un comune verificato non può avere le notti massime "non_trovato"' });
      }
    } else if (!d.notti_massime.rif) {
      ctx.addIssue({ code: 'custom', path: ['notti_massime', 'rif'], message: 'Serve il rif: da dove viene questo valore?' });
    } else {
      controlla(d.notti_massime.rif, ['notti_massime']);
    }
    d.notti_massime.eccezioni.forEach((e, i) => {
      controlla(e.rif, ['notti_massime', 'eccezioni', i]);
      if (e.valore === 'non_trovato' && d.stato === 'verificato') {
        ctx.addIssue({ code: 'custom', path: ['notti_massime', 'eccezioni', i], message: 'Un comune verificato non può avere notti massime "non_trovato"' });
      }
    });
    d.esenzioni.forEach((e, i) => controlla(e.rif, ['esenzioni', i]));
    d.riduzioni.forEach((r, i) => controlla(r.rif, ['riduzioni', i]));
    for (const p of ['airbnb', 'vrbo'] as const) {
      const r = d.riscossione[p];
      if (r.valore === 'non_verificato') continue;
      if (!r.rif) ctx.addIssue({ code: 'custom', path: ['riscossione', p, 'rif'], message: 'Serve il rif: da dove viene questo valore?' });
      else controlla(r.rif, ['riscossione', p]);
    }
    d.scadenze.forEach((s, i) => controlla(s.rif, ['scadenze', i]));
  });

export type ImpostaSoggiorno = z.infer<typeof schemaImposta>;
