import type { RequestContext } from '../reliability/scheduler.js';
export function recordResult<T>(data: T, ctx: RequestContext, wallNow: number) {
  return { data, fetchedAt: new Date(wallNow).toISOString(), requestId: ctx.requestId };
}
export function pageResult<T>(
  result: { data: T[]; total: number | null; totalPages: number | null },
  page: { page: number; per_page: number },
  ctx: RequestContext,
  wallNow: number,
) {
  const hasMore = result.totalPages === null ? null : page.page < result.totalPages;
  return {
    ...recordResult(result.data, ctx, wallNow),
    pagination: {
      page: page.page,
      perPage: page.per_page,
      total: result.total,
      totalPages: result.totalPages,
      hasMore,
      nextPage: hasMore && page.page < 10000 ? page.page + 1 : null,
    },
  };
}
