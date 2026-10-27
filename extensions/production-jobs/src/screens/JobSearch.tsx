import {useState} from 'preact/hooks';
import {api, failureMessage} from '../api';
import {routes} from '../Modal';
import {pluralise, shortDateTime} from '../format';
import type {ProductionJobSummary} from '../types';

export function JobSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductionJobSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (value: string) => {
    const term = value.trim();
    setQuery(term);
    if (term === '') {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.searchJobs(term);
      setResults(result.data);
    } catch (e) {
      setError(failureMessage(e, 'Search failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <s-page heading="Production jobs">
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">
          <s-search-field
            placeholder="Search by order number or job reference"
            value={query}
            onChange={(event) => search(event.currentTarget.value ?? '')}
          />

          {error && <s-banner heading={error} tone="critical" />}
          {loading && <s-spinner accessibilityLabel="Searching jobs" />}

          {results && results.length === 0 && !loading && (
            <s-text>No jobs match "{query}". Try the order number without the hash, or the job reference.</s-text>
          )}

          {results && results.length > 0 && (
            <s-section heading={pluralise(results.length, 'job')}>
              <s-stack direction="block" gap="base">
                {results.map((job) => (
                  <s-section key={job.id}>
                    <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                      <s-stack direction="block" gap="small-200">
                        <s-text type="strong">{job.reference}</s-text>
                        <s-text>
                          Order {job.order_name ?? ''} · {pluralise(job.item_count, 'item')}
                        </s-text>
                        <s-text tone="neutral">
                          Created {shortDateTime(job.created_at)} · {pluralise(job.print_count, 'print')}
                        </s-text>
                      </s-stack>
                      <s-button variant="primary" onClick={() => navigation.navigate(routes.job(job.reference))}>
                        View
                      </s-button>
                    </s-stack>
                  </s-section>
                ))}
              </s-stack>
            </s-section>
          )}

          <s-button variant="secondary" onClick={() => navigation.navigate(routes.queue())}>
            Orders to check
          </s-button>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
