export const messages = {
  OVERLOADED: 'Connector capacity is full. Retry later.',
  SHUTTING_DOWN: 'Connector is shutting down.',
  CANCELLED: 'Request was cancelled.',
  DEADLINE_EXCEEDED: 'Request exceeded its total deadline.',
  AUTH_FAILED: 'Check store credentials and read permissions.',
  NOT_FOUND: 'Record or WooCommerce endpoint not found.',
  UPSTREAM_BUSY: 'Store is busy. Retry later.',
  UPSTREAM_ERROR: 'Store rejected the request.',
  CONNECTION_FAILED: 'Unable to reach the store. Check TLS and availability.',
  INVALID_RESPONSE: 'Store returned an invalid response.',
  RESPONSE_TOO_LARGE: 'Store response exceeded the configured limit. Request a smaller page.',
  INVALID_PATH: 'Unsupported endpoint.',
  INTERNAL_ERROR: 'Connector could not complete this request.',
} as const;
export type ErrorCode = keyof typeof messages;
export class ConnectorError extends Error {
  requestId?: string;
  constructor(
    public readonly code: ErrorCode,
    public readonly retryAfterMs?: number,
  ) {
    super(messages[code]);
  }
}
export function safeError(error: unknown): ConnectorError {
  return error instanceof ConnectorError ? error : new ConnectorError('INTERNAL_ERROR');
}
export function cancellation(signal: AbortSignal): ConnectorError {
  return signal.reason instanceof ConnectorError ? signal.reason : new ConnectorError('CANCELLED');
}
