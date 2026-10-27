/**
 * Printer discovery and ticket printing via the POS Printing API.
 *
 * One connected printer: use it. Several: the first connected one is used and the
 * choice is remembered for the rest of the modal session; staff can change it from
 * the job screen. None: fall back to the system print dialog.
 *
 * The Printing API (`shopify.printing`) needs Shopify POS 11.11 or later. On older
 * builds it is absent, so printing falls back to the deprecated `shopify.print`
 * dialog API when that exists, and otherwise fails with a message that says why.
 *
 * Every failure is logged with the raw value POS rejected with (visible in
 * `shopify app dev` and Safari/Chrome remote inspector) and rethrown as an Error
 * whose message names the step and the printer, so screens can show it to staff.
 */

import {api, conflictCode, describeThrown, failureMessage} from './api';
import type {ProductionJobDetail} from './types';

export interface PrinterChoice {
  id: string;
  name: string;
  connected: boolean;
}

export const MIN_POS_VERSION_FOR_PRINTING = '11.11';

type PrintingApi = typeof shopify.printing;
type LegacyPrintApi = {print(src: string): Promise<void>};

let preferredPrinterId: string | null = null;

function printingApi(): PrintingApi | null {
  const api = (shopify as {printing?: PrintingApi}).printing;
  return api && typeof api.print === 'function' && typeof api.getPrinters === 'function' ? api : null;
}

function legacyPrintApi(): LegacyPrintApi | null {
  const api = (shopify as unknown as {print?: Partial<LegacyPrintApi>}).print;
  return api && typeof api.print === 'function' ? (api as LegacyPrintApi) : null;
}

/** True when this POS build exposes the Printing API (printer discovery and direct printing). */
export function directPrintingSupported(): boolean {
  return printingApi() !== null;
}

async function attempt<T>(step: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[production-jobs] ${step} failed`, error);
    throw new Error(`${step} failed: ${describeThrown(error) ?? 'POS gave no reason'}`);
  }
}

export async function listPrinters(): Promise<PrinterChoice[]> {
  const printing = printingApi();
  if (!printing) return [];

  try {
    const printers = await printing.getPrinters();
    return printers.map((printer) => ({id: printer.id, name: printer.name, connected: printer.connected}));
  } catch (error) {
    console.error('[production-jobs] Printer lookup failed', error);
    return [];
  }
}

export function setPreferredPrinter(id: string | null) {
  preferredPrinterId = id;
}

export function getPreferredPrinterId() {
  return preferredPrinterId;
}

async function resolvePrinter(printing: PrintingApi) {
  const printers = await attempt('Printer lookup', () => printing.getPrinters());
  const connected = printers.filter((printer) => printer.connected);

  if (preferredPrinterId) {
    const preferred = connected.find((printer) => printer.id === preferredPrinterId);
    if (preferred) return preferred;
  }

  const chosen = connected[0] ?? null;
  if (chosen) preferredPrinterId = chosen.id;
  return chosen;
}

export interface PrintOutcome {
  printerId: string | null;
  usedDialog: boolean;
}

interface PrinterChoiceResolved {
  printing: PrintingApi | null;
  legacy: LegacyPrintApi | null;
  printer: Awaited<ReturnType<PrintingApi['getPrinters']>>[number] | null;
}

async function chooseDestination(): Promise<PrinterChoiceResolved> {
  const printing = printingApi();

  if (!printing) {
    const legacy = legacyPrintApi();
    if (!legacy) {
      throw new Error(
        `This Shopify POS build cannot print from apps. Update POS to ${MIN_POS_VERSION_FOR_PRINTING} or later.`,
      );
    }
    return {printing: null, legacy, printer: null};
  }

  return {printing, legacy: null, printer: await resolvePrinter(printing)};
}

async function sendToDestination(printUrl: string, destination: PrinterChoiceResolved): Promise<PrintOutcome> {
  const {printing, legacy, printer} = destination;

  if (!printing) {
    await attempt('Print via the system dialog (legacy POS)', () => legacy!.print(printUrl));
    return {printerId: null, usedDialog: true};
  }

  if (printer) {
    await attempt(`Print to ${printer.name}`, () => printing.print(printUrl, {printer}));
    return {printerId: printer.id, usedDialog: false};
  }

  await attempt('Print via the system dialog', () => printing.print(printUrl));
  return {printerId: null, usedDialog: true};
}

export type PrintJobResult =
  | {status: 'printed'; outcome: PrintOutcome; type: 'initial_print' | 'reprint'}
  | {status: 'skipped'; reason: string};

/** References whose print is currently in progress in this extension instance. */
const inFlight = new Set<string>();

/**
 * Print a job's ticket exactly once.
 *
 * The print is recorded with the backend *before* anything is sent to the printer. The
 * backend refuses a second record for the same job from the same device within a few
 * seconds, so if this flow is triggered more than once (double taps, queued events, a
 * remounted screen) only the first run prints; the rest return `skipped`. A module-level
 * lock short-circuits concurrent runs in the same instance without a round trip. If the
 * printer rejects the job the record is discarded again so the history stays accurate.
 */
export async function printJobTicket(job: ProductionJobDetail): Promise<PrintJobResult> {
  const reference = job.reference;

  if (inFlight.has(reference)) {
    console.warn(`[production-jobs] Ignored a second print of ${reference} while one is in progress`);
    return {status: 'skipped', reason: 'This ticket is already printing.'};
  }

  inFlight.add(reference);
  try {
    const destination = await chooseDestination();
    const type = job.print_events.some((event) => event.type === 'initial_print') ? 'reprint' : 'initial_print';

    let record: Awaited<ReturnType<typeof api.recordPrint>>;
    try {
      record = await api.recordPrint(reference, type, destination.printer?.id ?? null);
    } catch (error) {
      const code = conflictCode(error);
      if (code) {
        console.warn(`[production-jobs] Backend declined the print of ${reference}: ${code}`);
        return {status: 'skipped', reason: failureMessage(error, 'This ticket has just been printed.')};
      }
      throw error;
    }

    try {
      const outcome = await sendToDestination(record.print_url, destination);
      return {status: 'printed', outcome, type};
    } catch (error) {
      await api.discardPrint(reference, record.data.id).catch((discardError) => {
        console.error('[production-jobs] Could not discard the failed print record', discardError);
      });
      throw error;
    }
  } finally {
    inFlight.delete(reference);
  }
}
