// Descrive i file di dati in data/ e li controlla a ogni build:
// se a una voce manca la fonte o la data di verifica, il sito non si costruisce.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const fonte = z.object({
  nome: z.string(),
  titolo: z.string(),
  url: z.url(),
});

const commissioni = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './data/commissioni' }),
  schema: z
    .object({
      piattaforma: z.enum(['Airbnb', 'Vrbo']),
      caso: z.string(),
      /** Testo alternativo nella scelta del calcolatore (se diverso da "caso"). */
      etichetta_scelta: z.string().optional(),
      ordine: z.number().int(),
      /** Percentuale senza IVA, in punti: 15.5 vuol dire 15,5%. */
      commissione: z.number().min(0).max(40),
      /** La commissione è un massimo ("fino a"), non un valore fisso. */
      fino_a: z.boolean().default(false),
      /** Quando la commissione è la somma di più voci (es. 5% + 3%). */
      componenti: z.array(z.object({ voce: z.string(), percentuale: z.number() })).optional(),
      commissione_altri_host: z.object({ min: z.number(), max: z.number() }).optional(),
      nota_commissione: z.string().optional(),
      iva_aggiunta: z.boolean(),
      costo_ospite: z.discriminatedUnion('tipo', [
        z.object({ tipo: z.literal('nessuno') }),
        z.object({ tipo: z.literal('percentuale'), valore: z.string() }),
        z.object({ tipo: z.literal('variabile'), dettaglio: z.string() }),
      ]),
      descrizione_scelta: z.string(),
      quando: z.string(),
      in_uscita: z.boolean(),
      valida_dal: z.coerce.date().optional(),
      fonte,
      altre_fonti: z
        .array(fonte.extend({ ufficiale: z.boolean(), in_tabella: z.boolean().default(true) }))
        .default([]),
      verificato_il: z.coerce.date(),
      note: z.string().optional(),
    })
    .refine((d) => !d.componenti || d.componenti.reduce((a, c) => a + c.percentuale, 0) === d.commissione, {
      message: 'La somma dei componenti deve essere uguale alla commissione',
    }),
});

const fisco = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './data/fisco' }),
  schema: z.object({
    iva: z.object({
      valore: z.number(),
      descrizione: z.string(),
      fonte,
      verificato_il: z.coerce.date(),
    }),
    ritenuta: z.object({
      descrizione: z.string(),
      fonte,
      verificato_il: z.coerce.date(),
      opzioni: z
        .array(
          z.object({
            valore: z.number(),
            etichetta: z.string(),
            predefinita: z.boolean().default(false),
            note: z.string().optional(),
          }),
        )
        .min(1),
    }),
  }),
});

const supplementi = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './data/supplementi' }),
  schema: z.object({
    nome: z.string(),
    descrizione: z.string(),
    /** Come si può applicare il supplemento (a prenotazione, a notte...). */
    modalita: z.array(z.object({ valore: z.string(), etichetta: z.string() })).min(1),
    /** La piattaforma trattiene la ritenuta anche su questo importo. */
    ritenuta_inclusa: z.boolean(),
    piattaforme: z
      .array(
        z.object({
          piattaforma: z.enum(['Airbnb', 'Vrbo']),
          /** La commissione della piattaforma si paga anche su questo importo. */
          commissione_inclusa: z.boolean(),
          modalita: z.string(),
          limite: z.string().optional(),
          fonte,
          fonte_commissione: fonte,
          verificato_il: z.coerce.date(),
          note: z.string().optional(),
        }),
      )
      .length(2),
    verificato_il: z.coerce.date(),
    note: z.string().optional(),
  }),
});

export const collections = { commissioni, fisco, supplementi };
