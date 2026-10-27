import {useEffect, useState} from 'preact/hooks';
import {api, failureMessage} from '../api';
import {routes} from '../Modal';
import {pluralise, relativeTime} from '../format';
import type {OrderReviewSummary} from '../types';

export function ReviewQueue() {
  const [reviews, setReviews] = useState<OrderReviewSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.pendingReviews(nextPage);
      setReviews(result.data);
      setTotal(result.meta.total);
      setPage(result.meta.current_page);
      setLastPage(result.meta.last_page);
    } catch (e) {
      setError(failureMessage(e, 'Could not load orders.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  return (
    <s-page heading="Orders to check">
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">
          {error && (
            <s-banner heading={error} tone="critical">
              <s-button slot="primary-action" onClick={() => load(page)}>
                Try again
              </s-button>
            </s-banner>
          )}

          {loading && reviews.length === 0 && <s-spinner accessibilityLabel="Loading orders" />}

          {!loading && !error && reviews.length === 0 && (
            <s-section heading="All caught up">
              <s-text>Every order has been checked. New orders show up here as soon as they are paid.</s-text>
            </s-section>
          )}

          {reviews.length > 0 && (
            <s-section heading={`${pluralise(total, 'order')} waiting`}>
              <s-stack direction="block" gap="base">
                {reviews.map((review) => (
                  <s-section key={review.id}>
                    <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                      <s-stack direction="block" gap="small-200">
                        <s-text type="strong">{review.order_name ?? review.shopify_order_id}</s-text>
                        <s-text>
                          {pluralise(review.line_item_count, 'item')}
                          {review.customer_name ? ` · ${review.customer_name}` : ''}
                        </s-text>
                        <s-text tone="neutral">{relativeTime(review.order_placed_at ?? review.created_at)}</s-text>
                      </s-stack>
                      <s-button variant="primary" onClick={() => navigation.navigate(routes.review(review.id))}>
                        Open
                      </s-button>
                    </s-stack>
                  </s-section>
                ))}
              </s-stack>
            </s-section>
          )}

          {lastPage > 1 && (
            <s-stack direction="inline" gap="base" justifyContent="center">
              <s-button disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
                Previous
              </s-button>
              <s-text>
                Page {page} of {lastPage}
              </s-text>
              <s-button disabled={page >= lastPage || loading} onClick={() => load(page + 1)}>
                Next
              </s-button>
            </s-stack>
          )}

          <s-stack direction="inline" gap="base" justifyContent="space-between">
            <s-button variant="secondary" onClick={() => load(page)} disabled={loading}>
              Refresh
            </s-button>
            <s-button variant="secondary" onClick={() => navigation.navigate(routes.search())}>
              Find a job
            </s-button>
          </s-stack>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
