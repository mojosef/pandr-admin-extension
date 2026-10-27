import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {api} from './api';

const REFRESH_MS = 60_000;

export default async () => {
  render(<Tile />, document.body);
};

function Tile() {
  const [pending, setPending] = useState<number | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const count = await api.pendingCount();
        if (!cancelled) {
          setPending(count);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const subheading = failed
    ? 'Admin unreachable'
    : pending === undefined
      ? 'Checking orders'
      : pending === 0
        ? 'All orders checked'
        : `${pending} to check`;

  return (
    <s-tile
      heading="Orders to Check"
      subheading={subheading}
      itemCount={pending && pending > 0 ? pending : undefined}
      onClick={() => shopify.action.presentModal()}
    />
  );
}
