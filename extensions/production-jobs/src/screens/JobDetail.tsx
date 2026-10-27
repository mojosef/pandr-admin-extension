import {useEffect, useState} from 'preact/hooks';
import {api, failureMessage} from '../api';
import {routes} from '../Modal';
import {pluralise, propertyLine, shortDateTime} from '../format';
import {
  MIN_POS_VERSION_FOR_PRINTING,
  directPrintingSupported,
  getPreferredPrinterId,
  listPrinters,
  printJobTicket,
  setPreferredPrinter,
  type PrinterChoice,
} from '../printing';
import type {ProductionJobDetail} from '../types';

interface Props {
  reference: string;
}

export function JobDetail({reference}: Props) {
  const [job, setJob] = useState<ProductionJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printers, setPrinters] = useState<PrinterChoice[]>([]);
  const [printerId, setPrinterId] = useState<string | null>(getPreferredPrinterId());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setJob(await api.job(reference));
    } catch (e) {
      setError(failureMessage(e, 'Could not load the job.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    listPrinters().then(setPrinters);
  }, [reference]);

  const reprint = async () => {
    if (!job || printing) return;
    setPrinting(true);
    setError(null);
    try {
      const fresh = await api.job(job.reference);
      const result = await printJobTicket(fresh);
      if (result.status === 'skipped') {
        shopify.toast.show(result.reason);
      } else {
        shopify.toast.show(result.outcome.usedDialog ? 'Sent to the print dialog' : 'Ticket reprinted');
      }
      setJob(await api.job(job.reference));
    } catch (e) {
      setError(failureMessage(e, 'Ticket failed to print.'));
    } finally {
      setPrinting(false);
    }
  };

  const choosePrinter = (id: string) => {
    setPrinterId(id);
    setPreferredPrinter(id);
  };

  const connectedPrinters = printers.filter((printer) => printer.connected);

  return (
    <s-page heading={`Job ${job?.reference ?? reference}`}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">
          {error && (
            <s-banner heading={error} tone="critical">
              <s-button slot="primary-action" onClick={load}>
                Try again
              </s-button>
            </s-banner>
          )}

          {loading && <s-spinner accessibilityLabel="Loading job" />}

          {job && (
            <s-section heading={`Order ${job.order_name ?? ''}`}>
              <s-stack direction="block" gap="base">
                {job.items.map((item) => (
                  <s-stack key={item.id} direction="block" gap="small-200">
                    <s-text type="strong">
                      {item.quantity} × {item.title}
                    </s-text>
                    {item.variant_title && <s-text>{item.variant_title}</s-text>}
                    {item.properties.map((property) => (
                      <s-text key={property.key} tone="info">
                        {propertyLine(property.key, property.value)}
                      </s-text>
                    ))}
                  </s-stack>
                ))}
                <s-text tone="neutral">
                  Barcode {job.barcode_value} · Created {shortDateTime(job.created_at)}
                </s-text>
              </s-stack>
            </s-section>
          )}

          {job && (
            <s-section heading="Print history">
              {job.print_events.length === 0 ? (
                <s-text>Not printed yet.</s-text>
              ) : (
                <s-stack direction="block" gap="small-200">
                  {job.print_events.map((event) => (
                    <s-text key={event.id}>
                      {shortDateTime(event.created_at)} · {event.type === 'initial_print' ? 'Original' : 'Reprint'}
                      {event.staff_member_id ? ` · Staff ${event.staff_member_id}` : ''}
                    </s-text>
                  ))}
                </s-stack>
              )}
            </s-section>
          )}

          {connectedPrinters.length > 1 && (
            <s-section heading="Printer">
              <s-choice-list
                values={printerId ? [printerId] : []}
                onChange={(event) => {
                  const chosen = event.currentTarget.values?.[0];
                  if (chosen) choosePrinter(chosen);
                }}
              >
                {connectedPrinters.map((printer) => (
                  <s-choice key={printer.id} value={printer.id}>
                    {printer.name}
                  </s-choice>
                ))}
              </s-choice-list>
            </s-section>
          )}

          {job && (
            <s-stack direction="block" gap="base">
              <s-button variant="primary" loading={printing} disabled={printing} onClick={reprint}>
                {job.print_events.length === 0 ? 'Print ticket' : 'Reprint ticket'}
              </s-button>
              <s-text tone="neutral">{pluralise(job.items.length, 'item')} on one ticket</s-text>
              {!directPrintingSupported() && (
                <s-text tone="warning">
                  Receipt printers need Shopify POS {MIN_POS_VERSION_FOR_PRINTING} or later. This device will use the
                  print dialog.
                </s-text>
              )}
              <s-stack direction="inline" gap="base" justifyContent="space-between">
                <s-button variant="secondary" onClick={() => navigation.navigate(routes.search())}>
                  Find another job
                </s-button>
                <s-button variant="secondary" onClick={() => navigation.navigate(routes.queue())}>
                  Orders to check
                </s-button>
              </s-stack>
            </s-stack>
          )}
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
