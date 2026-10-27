import {useEffect, useRef, useState} from 'preact/hooks';
import {api, failureMessage} from '../api';
import {routes} from '../Modal';
import {printJobTicket} from '../printing';
import type {ProductionJobDetail} from '../types';

interface Props {
  reference: string;
}

type PrintState = 'printing' | 'printed' | 'failed';

/**
 * Shown straight after a job is created: prints the ticket once and offers a retry that
 * reuses the same job and reference. Duplicate triggers are refused by printJobTicket.
 */
export function JobResult({reference}: Props) {
  const [job, setJob] = useState<ProductionJobDetail | null>(null);
  const [state, setState] = useState<PrintState>('printing');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const printAndRecord = async (current: ProductionJobDetail) => {
    setState('printing');
    setMessage(null);

    try {
      const result = await printJobTicket(current);
      setState('printed');
      if (result.status === 'skipped') {
        shopify.toast.show(result.reason);
      } else {
        shopify.toast.show(result.outcome.usedDialog ? 'Sent to the print dialog' : 'Ticket printed');
      }
    } catch (e) {
      setState('failed');
      setMessage(failureMessage(e, 'The printer did not respond.'));
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    api
      .job(reference)
      .then((detail) => {
        setJob(detail);
        return printAndRecord(detail);
      })
      .catch((e) => {
        setState('failed');
        setMessage(failureMessage(e, 'Could not load the job.'));
      });
  }, [reference]);

  return (
    <s-page heading={`Job ${reference}`}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">
          <s-banner heading="Production job created" tone="success" />

          {job && (
            <s-section heading={`Order ${job.order_name ?? ''}`}>
              <s-stack direction="block" gap="small-200">
                {job.items.map((item) => (
                  <s-text key={item.id}>
                    {item.quantity} × {item.title}
                    {item.variant_title ? ` (${item.variant_title})` : ''}
                  </s-text>
                ))}
              </s-stack>
            </s-section>
          )}

          {state === 'printing' && (
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-spinner accessibilityLabel="Printing ticket" />
              <s-text>Printing ticket</s-text>
            </s-stack>
          )}

          {state === 'printed' && <s-banner heading="Ticket printed" tone="success" />}

          {state === 'failed' && (
            <s-banner heading="Ticket failed to print" tone="critical">
              {job && (
                <s-button slot="primary-action" onClick={() => printAndRecord(job)}>
                  Retry print
                </s-button>
              )}
            </s-banner>
          )}

          {message && state === 'failed' && <s-text tone="critical">{message}</s-text>}

          <s-stack direction="inline" gap="base" justifyContent="space-between">
            <s-button variant="primary" onClick={() => navigation.navigate(routes.queue())}>
              Back to orders
            </s-button>
            <s-button variant="secondary" onClick={() => navigation.navigate(routes.job(reference))}>
              View job
            </s-button>
          </s-stack>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
