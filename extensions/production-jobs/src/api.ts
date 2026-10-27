import type {
  OrderReviewDetail,
  OrderReviewSummary,
  Paginated,
  PrintEvent,
  ProductionJobDetail,
  ProductionJobSummary,
} from './types';

/**
 * Thin client for the pandr-admin POS API.
 *
 * Requests use relative URLs so POS resolves them against the app's application_url
 * and attaches the session token Authorization header automatically. If a request
 * still comes back 401 we retry once with an explicit token from the Session API.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string | null = null,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isConflict() {
    return this.status === 409;
  }

  get jobReference(): string | null {
    const ref = this.body.job_reference;
    return typeof ref === 'string' ? ref : null;
  }
}

/**
 * Best-effort text for any thrown value. POS platform APIs do not always reject with an
 * Error, so strings and message-bearing objects are read too. Null when nothing useful.
 */
export function describeThrown(error: unknown): string | null {
  if (error instanceof Error) return error.message.trim() || null;
  if (typeof error === 'string') return error.trim() || null;
  if (error && typeof error === 'object') {
    const message = (error as {message?: unknown}).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    try {
      const json = JSON.stringify(error);
      return json && json !== '{}' ? json : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Message to show staff for any thrown value. */
export function failureMessage(error: unknown, fallback: string): string {
  return describeThrown(error) ?? fallback;
}

/** True when the backend answered 409 (already reviewed, job exists, duplicate print). */
export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** The machine-readable reason on a 409 response, if any (e.g. "duplicate_print"). */
export function conflictCode(error: unknown): string | null {
  return error instanceof ApiError && error.status === 409 ? error.code : null;
}

/** The existing job reference carried by a 409 response, if any. */
export function conflictJobReference(error: unknown): string | null {
  return error instanceof ApiError ? error.jobReference : null;
}

function posHeaders(): Record<string, string> {
  const session = shopify.session.currentSession;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (session?.staffMemberId) headers['X-POS-Staff-Member-Id'] = String(session.staffMemberId);
  if (session?.locationId) headers['X-POS-Location-Id'] = String(session.locationId);
  if (shopify.session.deviceId) headers['X-POS-Device-Id'] = String(shopify.session.deviceId);
  return headers;
}

async function request<T>(method: string, path: string, body?: unknown, withToken = false): Promise<T> {
  const headers = posHeaders();

  if (withToken) {
    const token = await shopify.session.getSessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(0, 'Could not reach the Pandr admin. Check the connection and try again.');
  }

  if (response.status === 401 && !withToken) {
    return request<T>(method, path, body, true);
  }

  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    const message = describeError(response.status, json);
    const code = typeof json.error === 'string' ? json.error : null;
    throw new ApiError(response.status, message, code, json);
  }

  return json as T;
}

function describeError(status: number, json: Record<string, unknown>): string {
  if (status === 422 && json.errors && typeof json.errors === 'object') {
    const first = Object.values(json.errors as Record<string, string[]>)[0];
    if (first?.[0]) return first[0];
  }
  if (typeof json.message === 'string' && json.message) return json.message;
  if (status === 401) return 'POS is not signed in to the Pandr admin. Sign in to POS with a staff account that has app access.';
  if (status === 404) return 'That record could not be found.';
  if (status === 502) return 'Shopify is not responding. Try again in a moment.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  return `Request failed (${status}).`;
}

export const api = {
  pendingReviews(page = 1, perPage = 25) {
    return request<Paginated<OrderReviewSummary>>('GET', `/api/pos/order-reviews?page=${page}&per_page=${perPage}`);
  },

  async pendingCount(): Promise<number> {
    const result = await request<Paginated<OrderReviewSummary>>('GET', '/api/pos/order-reviews?per_page=1');
    return result.meta?.total ?? 0;
  },

  review(id: number) {
    return request<{data: OrderReviewDetail}>('GET', `/api/pos/order-reviews/${id}`).then((r) => r.data);
  },

  completeWithoutWork(id: number) {
    return request<{data: OrderReviewSummary}>('POST', `/api/pos/order-reviews/${id}/complete`, {
      no_work_required: true,
    }).then((r) => r.data);
  },

  createJob(orderReviewId: number, lineItemIds: string[]) {
    return request<{data: ProductionJobDetail}>('POST', '/api/pos/production-jobs', {
      order_review_id: orderReviewId,
      line_item_ids: lineItemIds,
    }).then((r) => r.data);
  },

  searchJobs(search: string, page = 1) {
    const query = new URLSearchParams({search, page: String(page), per_page: '25'});
    return request<Paginated<ProductionJobSummary>>('GET', `/api/pos/production-jobs?${query.toString()}`);
  },

  job(reference: string) {
    return request<{data: ProductionJobDetail}>('GET', `/api/pos/production-jobs/${encodeURIComponent(reference)}`).then(
      (r) => r.data,
    );
  },

  recordPrint(reference: string, type: 'initial_print' | 'reprint', printerId: string | null) {
    return request<{data: PrintEvent; print_url: string; print_url_expires_at: string}>(
      'POST',
      `/api/pos/production-jobs/${encodeURIComponent(reference)}/print-events`,
      {type, printer_id: printerId},
    );
  },

  /** Remove a print event recorded moments ago because the printer rejected the job. */
  discardPrint(reference: string, eventId: number) {
    return request<void>(
      'DELETE',
      `/api/pos/production-jobs/${encodeURIComponent(reference)}/print-events/${eventId}`,
    );
  },
};
