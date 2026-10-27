export interface OrderReviewSummary {
  id: number;
  shopify_order_id: string;
  shopify_order_legacy_id: number | null;
  order_name: string | null;
  order_number: number | null;
  customer_name: string | null;
  line_item_count: number;
  status: 'pending' | 'reviewed';
  outcome: 'no_work_required' | 'job_created' | null;
  order_placed_at: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  production_job?: {reference: string; barcode_value: string} | null;
}

export interface LineItemProperty {
  key: string;
  value: string;
}

export interface ReviewLineItem {
  id: string;
  legacy_id: number | null;
  product_id: string | null;
  variant_id: string | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  current_quantity: number;
  properties: LineItemProperty[];
}

export interface OrderReviewDetail extends OrderReviewSummary {
  order: {id: string; name: string; cancelled_at: string | null};
  line_items: ReviewLineItem[];
}

export interface PrintEvent {
  id: number;
  type: 'initial_print' | 'reprint';
  printer_id: string | null;
  staff_member_id: string | null;
  location_id: string | null;
  device_id: string | null;
  created_at: string | null;
}

export interface ProductionJobItem {
  id: number;
  position: number;
  shopify_line_item_id: string;
  product_id: string | null;
  variant_id: string | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  properties: LineItemProperty[];
}

export interface ProductionJobSummary {
  id: number;
  reference: string;
  barcode_value: string;
  status: string;
  order_review_id: number;
  shopify_order_id: string;
  order_name: string | null;
  order_number: number | null;
  item_count: number;
  print_count: number;
  last_printed_at: string | null;
  created_at: string | null;
  created_by: string | null;
}

export interface ProductionJobDetail extends ProductionJobSummary {
  items: ProductionJobItem[];
  print_events: PrintEvent[];
  print_url: string;
  print_url_expires_at: string;
}

export interface Paginated<T> {
  data: T[];
  meta: {current_page: number; last_page: number; per_page: number; total: number};
}
