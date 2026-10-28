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
  price: number;
  cleaning: number;
  nights: number;
  mode: 'prop' | 'night';
}

export interface Fee {
  base: number;
  eff: number;
  label: string;
  guest: string | null;
}

export interface Riga {
  id: Piattaforma;
  name: string;
  isRef: boolean;
  fee: number;
  label: string;
  guest: string | null;
  exact: number;
  price: number;
  cleaningExact: number;
  cleaning: number;
  delta: number;
  feeAmt: number;
  withheld: number;
  net: number;
}

export interface Risultato {
  n: number;
  t: number;
  netStay: number;
  netNight: number;
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

export function computeRows(s: Stato, tassi: Tassi): Risultato | null {
  const price = sane(s.price, 0, 1e7, NaN);
  if (!(price > 0)) return null;
  const cleaning = sane(s.cleaning, 0, 1e7, 0);
  const n = Math.max(1, Math.round(sane(s.nights, 1, 365, 1)));
  const t = sane(s.tax, 0, 0.5, 0);
  const fRef = feeFor(s.ref, s, tassi).eff;
  const gross = price * n + cleaning;
  const netStay = gross * (1 - fRef - t);
  const rows = (['airbnb', 'vrbo'] as const).map((id): Riga => {
    const f = feeFor(id, s, tassi);
    const isRef = id === s.ref;
    let p: number;
    let c: number;
    if (isRef) { p = price; c = cleaning; }
    else if (s.mode === 'night') { c = cleaning; p = Math.max(0, (netStay / (1 - f.eff - t) - cleaning) / n); }
    else { const k = (1 - fRef - t) / (1 - f.eff - t); p = price * k; c = cleaning * k; }
    const pr = isRef ? p : Math.ceil(p - 1e-9);
    const cr = isRef ? c : Math.max(0, Math.ceil(c - 1e-9));
    const g = pr * n + cr;
    return {
      id, name: id === 'airbnb' ? 'Airbnb' : 'Vrbo', isRef, fee: f.eff, label: f.label, guest: f.guest,
      exact: p, price: pr, cleaningExact: c, cleaning: cr, delta: p / price - 1,
      feeAmt: g * f.eff, withheld: g * t, net: g * (1 - f.eff - t),
    };
  });
  return { n, t, netStay, netNight: netStay / n, rows };
}
