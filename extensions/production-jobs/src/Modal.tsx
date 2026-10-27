import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {ReviewQueue} from './screens/ReviewQueue';
import {ReviewOrder} from './screens/ReviewOrder';
import {JobResult} from './screens/JobResult';
import {JobSearch} from './screens/JobSearch';
import {JobDetail} from './screens/JobDetail';

/** Identifies this sandbox instance in console output when diagnosing duplicate renders. */
const instanceId = Math.random().toString(36).slice(2, 8);
let renderCalls = 0;

export default async () => {
  renderCalls += 1;
  console.info(`[production-jobs] modal render() call ${renderCalls} in instance ${instanceId}`);
  render(<Modal />, document.body);
};

/**
 * Screen routing. Every screen is addressed by a distinctive token in the navigation URL
 * so the modal can be driven with navigation.navigate() and navigation.back().
 */
export const routes = {
  queue: () => 'pandr-queue',
  review: (id: number) => `pandr-review-${id}`,
  result: (reference: string) => `pandr-result-${reference}`,
  search: () => 'pandr-search',
  job: (reference: string) => `pandr-job-${reference}`,
};

type Screen =
  | {name: 'queue'}
  | {name: 'review'; id: number}
  | {name: 'result'; reference: string}
  | {name: 'search'}
  | {name: 'job'; reference: string};

function parseScreen(url: string | undefined | null): Screen {
  const value = url ?? '';

  const review = value.match(/pandr-review-(\d+)/);
  if (review) return {name: 'review', id: Number(review[1])};

  const result = value.match(/pandr-result-([A-Za-z0-9-]+)/);
  if (result) return {name: 'result', reference: result[1]};

  const job = value.match(/pandr-job-([A-Za-z0-9-]+)/);
  if (job) return {name: 'job', reference: job[1]};

  if (value.includes('pandr-search')) return {name: 'search'};

  return {name: 'queue'};
}

function Modal() {
  const [screen, setScreen] = useState<Screen>(() => parseScreen(navigation.currentEntry?.url));

  useEffect(() => {
    console.info(`[production-jobs] Modal mounted in instance ${instanceId}`);
  }, []);

  useEffect(() => {
    const handler = () => setScreen(parseScreen(navigation.currentEntry?.url));
    navigation.addEventListener('currententrychange', handler);
    return () => navigation.removeEventListener('currententrychange', handler);
  }, []);

  switch (screen.name) {
    case 'review':
      return <ReviewOrder reviewId={screen.id} />;
    case 'result':
      return <JobResult reference={screen.reference} />;
    case 'search':
      return <JobSearch />;
    case 'job':
      return <JobDetail reference={screen.reference} />;
    default:
      return <ReviewQueue />;
  }
}
