import {useEffect, useState} from 'preact/hooks';
import {api, conflictJobReference, failureMessage, isConflict} from '../api';
import {routes} from '../Modal';
import {pluralise, propertyLine} from '../format';
import type {OrderReviewDetail} from '../types';

interface Props {
  reviewId: number;
}

export function ReviewOrder({reviewId}: Props) {
  const [review, setReview] = useState<OrderReviewDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'none' | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setReview(await api.review(reviewId));
    } catch (e) {
      setError(failureMessage(e, 'Could not load this order.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [reviewId]);

  const selectableItems = review?.line_items.filter((item) => item.current_quantity > 0) ?? [];

  const createJob = async () => {
    if (!review || selected.length === 0 || busy) return;
    setBusy('create');
    setError(null);
    try {
      const job = await api.createJob(review.id, selected);
      navigation.navigate(routes.result(job.reference));
    } catch (e) {
      const existing = conflictJobReference(e);
      if (existing) {
        shopify.toast.show(`Job ${existing} already exists for this order`);
        navigation.navigate(routes.job(existing));
        return;
      }
      setError(failureMessage(e, 'Could not create the job.'));
    } finally {
      setBusy(null);
    }
  };

  const noWorkRequired = async () => {
    if (!review || busy) return;
    setBusy('none');
    setError(null);
    try {
      await api.completeWithoutWork(review.id);
      shopify.toast.show(`${review.order_name ?? 'Order'} marked as no work required`);
      navigation.back();
    } catch (e) {
      if (isConflict(e)) {
        shopify.toast.show('This order has already been checked');
        navigation.back();
        return;
      }
      setError(failureMessage(e, 'Could not complete the review.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <s-page heading={review?.order.name ?? review?.order_name ?? 'Order'}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">
          {error && (
            <s-banner heading={error} tone="critical">
              <s-button slot="primary-action" onClick={load}>
                Try again
              </s-button>
            </s-banner>
          )}

          {loading && <s-spinner accessibilityLabel="Loading order" />}

          {review && review.order.cancelled_at && (
            <s-banner heading="This order has been cancelled in Shopify" tone="warning" />
          )}

          {review && (
            <s-section heading="Select items requiring work">
              {selectableItems.length === 0 ? (
                <s-text>This order has no items that can be produced.</s-text>
              ) : (
                <s-choice-list
                  multiple
                  values={selected}
                  onChange={(event) => setSelected([...(event.currentTarget.values ?? [])])}
                >
                  {selectableItems.map((item) => (
                    <s-choice key={item.id} value={item.id}>
                      <s-stack direction="block" gap="small-200">
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
                    </s-choice>
                  ))}
                </s-choice-list>
              )}
            </s-section>
          )}

          {review && (
            <s-stack direction="block" gap="base">
              <s-text>{selected.length === 0 ? 'No items selected' : `${pluralise(selected.length, 'item')} selected`}</s-text>
              <s-button
                variant="primary"
                disabled={selected.length === 0 || busy !== null}
                loading={busy === 'create'}
                onClick={createJob}
              >
                {busy === 'create' ? 'Creating job' : 'Create & print job'}
              </s-button>
              <s-button variant="secondary" disabled={busy !== null} loading={busy === 'none'} onClick={noWorkRequired}>
                No work required
              </s-button>
            </s-stack>
          )}
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
