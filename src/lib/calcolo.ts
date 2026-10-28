// Logica del calcolatore: dato il prezzo su una piattaforma, trova il prezzo
// sull'altra che dà lo stesso incasso netto. Le percentuali arrivano dai file
// in data/ (vedi src/content.config.ts), qui non c'è nessun numero fiscale.

export type Piattaforma = 'airbnb' | 'vrbo';

/** Un caso di commissione, con la percentuale in punti (15,5 = 15,5%). */
export interface Caso {
  percentuale: number;
  label: string;
  guest: string | null;
}

/** Tutte le percentuali che servono al calcolo, lette dai file di dati. */
export interface Tassi {
  /** IVA aggiunta alle commissioni, in punti (22 = 22%). */
  iva: number;
  airbnb: { single: Caso; split: Caso; custom: Caso };
  vrbo: { ppb: Caso; old: Caso; custom: Caso };
  /** Su quali trattenute pesa il supplemento animali (da data/supplementi/animali.yaml). */
  animali: { commissione: Record<Piattaforma, boolean>; ritenuta: boolean };
}

/** Le scelte dell'utente nel modulo. */
export interface Stato {
  ab: 'single' | 'split' | 'custom';
  abCustom: number;
  vr: 'ppb' | 'old' | 'custom';
  vrCustom: number;
  iva: 'priv' | 'forf' | 'ord';
  /** Ritenuta come frazione (0,21 = 21%). */
  tax: number;
  ref: Piattaforma;
  /** Prezzo a notte sulla piattaforma di partenza. */
  price: number;
  /** Pulizia, a soggiorno. */
  cleaning: number;
  /** Supplemento animali, nella modalità scelta (a prenotazione, a notte...). */
  pet: number;
}

/** Le voci di prezzo: ognuna si converte da sola, senza bisogno del numero di notti. */
export type Voce = 'notte' | 'pulizia' | 'animali';
export const VOCI: readonly Voce[] = ['notte', 'pulizia', 'animali'];

export interface Fee {
  base: number;
  eff: number;
  label: string;
  guest: string | null;
}

/** Un importo su una piattaforma: esatto, arrotondato all'euro e quanto resta all'host. */
export interface Importo {
  exact: number;
  value: number;
  net: number;
}

export interface Riga {
  id: Piattaforma;
  name: string;
  isRef: boolean;
  fee: number;
  label: string;
  guest: string | null;
  voci: Record<Voce, Importo>;
  /** Differenza del prezzo a notte rispetto alla partenza (0,07 = +7%). */
  delta: number;
}

export interface Risultato {
  t: number;
  /** Netto per l'host di ogni voce, uguale sulle due piattaforme. */
  netti: Record<Voce, number>;
  rows: Riga[];
}

export function sane(x: unknown, lo: number, hi: number, dflt: number): number {
  return typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt;
}

function vatMult(s: Stato, tassi: Tassi): number {
  return s.iva === 'ord' ? 1 : (100 + tassi.iva) / 100;
}

function customLabel(base: number): string {
  return 'Commissione ' + (base * 100).toLocaleString('it-IT') + '%';
}

export function feeFor(id: Piattaforma, s: Stato, tassi: Tassi): Fee {
  const v = vatMult(s, tassi);
  let base: number;
  let label: string;
  let guest: string | null;
  if (id === 'airbnb') {
    const c = tassi.airbnb;
    if (s.ab === 'split') { base = c.split.percentuale / 100; label = c.split.label; guest = c.split.guest; }
    else if (s.ab === 'custom') { base = sane(s.abCustom, 0, 40, c.custom.percentuale) / 100; label = customLabel(base); guest = c.custom.guest; }
    else { base = c.single.percentuale / 100; label = c.single.label; guest = c.single.guest; }
  } else {
    const c = tassi.vrbo;
    if (s.vr === 'old') { base = c.old.percentuale / 100; label = c.old.label; guest = c.old.guest; }
    else if (s.vr === 'custom') { base = sane(s.vrCustom, 0, 40, c.custom.percentuale) / 100; label = customLabel(base); guest = c.custom.guest; }
    else { base = c.ppb.percentuale / 100; label = c.ppb.label; guest = c.ppb.guest; }
  }
  return { base, eff: base * v, label: label + (v > 1 ? ' + IVA' : ''), guest };
}

/** Quota del lordo che resta all'host per una voce, dopo commissione (con IVA) e ritenuta. */
export function quota(id: Piattaforma, voce: Voce, s: Stato, tassi: Tassi): number {
  const t = sane(s.tax, 0, 0.5, 0);
  const animali = voce === 'animali';
  const fee = !animali || tassi.animali.commissione[id] ? feeFor(id, s, tassi).eff : 0;
  return 1 - fee - (!animali || tassi.animali.ritenuta ? t : 0);
}

export function computeRows(s: Stato, tassi: Tassi): Risultato | null {
  const price = sane(s.price, 0, 1e7, NaN);
  if (!(price > 0)) return null;
  const partenza: Record<Voce, number> = {
    notte: price,
    pulizia: sane(s.cleaning, 0, 1e7, 0),
    animali: sane(s.pet, 0, 1e7, 0),
  };
  const netti = {} as Record<Voce, number>;
  for (const v of VOCI) netti[v] = partenza[v] * quota(s.ref, v, s, tassi);

  const rows = (['airbnb', 'vrbo'] as const).map((id): Riga => {
    const f = feeFor(id, s, tassi);
    const isRef = id === s.ref;
    const voci = {} as Record<Voce, Importo>;
    for (const v of VOCI) {
      const q = quota(id, v, s, tassi);
      const exact = isRef ? partenza[v] : netti[v] / q;
      // Sull'altra piattaforma si arrotonda all'euro per eccesso: si incassa un filo di più, mai meno.
      const value = isRef ? exact : Math.max(0, Math.ceil(exact - 1e-9));
      voci[v] = { exact, value, net: value * q };
    }
    return {
      id, name: id === 'airbnb' ? 'Airbnb' : 'Vrbo', isRef, fee: f.eff, label: f.label, guest: f.guest,
      voci, delta: voci.notte.exact / price - 1,
    };
  });
  return { t: sane(s.tax, 0, 0.5, 0), netti, rows };
}
