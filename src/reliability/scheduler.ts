import { randomUUID } from 'node:crypto';
import type { Limits } from '../config.js';
import { ConnectorError, cancellation, safeError } from '../contracts/errors.js';
import type { Clock } from './clock.js';
import type { Operation, Telemetry } from '../observability/telemetry.js';
export interface RequestContext {
  requestId: string;
  operation: Operation;
  signal: AbortSignal;
  deadlineAt: number;
}
interface Job {
  controller: AbortController;
  start(): void;
  rejectQueued(): void;
}

export class StoreScheduler {
  private active = new Set<Job>();
  private queue: Job[] = [];
  private closed = false;
  private nextStartAt = 0;
  private blockedUntil = 0;
  private idleResolvers = new Set<() => void>();
  constructor(
    private limits: Limits,
    private clock: Clock,
    private telemetry: Telemetry,
  ) {}
  private gauges() {
    this.telemetry.gauges(this.active.size, this.queue.length);
  }
  private pump() {
    while (!this.closed && this.active.size < this.limits.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.active.add(job);
      this.gauges();
      job.start();
    }
    if (!this.active.size && !this.queue.length) {
      for (const resolve of this.idleResolvers) resolve();
      this.idleResolvers.clear();
    }
  }
  run<T>(
    operation: Operation,
    external: AbortSignal | undefined,
    work: (ctx: RequestContext) => Promise<T>,
  ): Promise<T> {
    const requestId = randomUUID();
    const refusal = this.closed
      ? 'SHUTTING_DOWN'
      : external?.aborted
        ? 'CANCELLED'
        : this.active.size >= this.limits.concurrency &&
            this.queue.length >= this.limits.queueCapacity
          ? 'OVERLOADED'
          : undefined;
    if (refusal) {
      const error = new ConnectorError(refusal);
      error.requestId = requestId;
      this.telemetry.emit('rejected', { operation, requestId, code: error.code });
      return Promise.reject(error);
    }
    const entered = this.clock.now();
    const controller = new AbortController();
    const ctx = {
      operation,
      requestId,
      signal: controller.signal,
      deadlineAt: entered + this.limits.deadlineMs,
    };
    return new Promise<T>((resolve, reject) => {
      let started = false;
      let finished = false;
      const forward = () => controller.abort(new ConnectorError('CANCELLED'));
      const cancelTimer = this.clock.timer(this.limits.deadlineMs, () =>
        controller.abort(new ConnectorError('DEADLINE_EXCEEDED')),
      );
      const finish = (error?: unknown, value?: T) => {
        if (finished) return;
        finished = true;
        cancelTimer();
        external?.removeEventListener('abort', forward);
        controller.signal.removeEventListener('abort', abort);
        this.active.delete(job);
        this.queue = this.queue.filter((item) => item !== job);
        this.gauges();
        const failure =
          error === undefined
            ? this.clock.now() >= ctx.deadlineAt
              ? new ConnectorError('DEADLINE_EXCEEDED')
              : undefined
            : safeError(error);
        if (failure) failure.requestId = requestId;
        this.telemetry.emit('completed', {
          operation,
          requestId,
          code: failure?.code,
          durationMs: this.clock.now() - entered,
        });
        if (failure) reject(failure);
        else resolve(value as T);
        this.pump();
      };
      const abort = () => {
        if (!started) finish(cancellation(controller.signal));
      };
      const job: Job = {
        controller,
        rejectQueued: () => controller.abort(new ConnectorError('SHUTTING_DOWN')),
        start: () => {
          if (this.clock.now() >= ctx.deadlineAt) {
            controller.abort(new ConnectorError('DEADLINE_EXCEEDED'));
            return;
          }
          started = true;
          this.telemetry.emit('started', {
            operation,
            requestId,
            queueWaitMs: this.clock.now() - entered,
          });
          Promise.resolve()
            .then(() => {
              if (ctx.signal.aborted) throw cancellation(ctx.signal);
              return work(ctx);
            })
            .then(
              (value) =>
                ctx.signal.aborted ? finish(cancellation(ctx.signal)) : finish(undefined, value),
              (error) => finish(ctx.signal.aborted ? cancellation(ctx.signal) : safeError(error)),
            );
        },
      };
      external?.addEventListener('abort', forward, { once: true });
      controller.signal.addEventListener('abort', abort, { once: true });
      const immediate = this.active.size < this.limits.concurrency;
      if (immediate) this.active.add(job);
      else this.queue.push(job);
      this.gauges();
      this.telemetry.emit('admitted', { operation, requestId });
      if (immediate) job.start();
    });
  }
  async beforeAttempt(ctx: RequestContext) {
    while (true) {
      if (ctx.signal.aborted) throw cancellation(ctx.signal);
      if (this.clock.now() >= ctx.deadlineAt) throw new ConnectorError('DEADLINE_EXCEEDED');
      const wait = Math.max(this.nextStartAt, this.blockedUntil) - this.clock.now();
      if (wait <= 0) {
        this.nextStartAt = this.clock.now() + 1000 / this.limits.startsPerSecond;
        return;
      }
      if (this.blockedUntil > this.clock.now() && wait >= ctx.deadlineAt - this.clock.now())
        throw new ConnectorError('UPSTREAM_BUSY', Math.ceil(wait));
      await this.clock.sleep(wait, ctx.signal);
    }
  }
  cooldown(delayMs: number, ctx: RequestContext) {
    this.blockedUntil = Math.max(this.blockedUntil, this.clock.now() + delayMs);
    this.telemetry.emit('throttle', {
      requestId: ctx.requestId,
      operation: ctx.operation,
      delayMs,
    });
  }
  shutdown(): Promise<void> {
    this.closed = true;
    for (const job of [...this.queue]) job.rejectQueued();
    for (const job of this.active) job.controller.abort(new ConnectorError('SHUTTING_DOWN'));
    if (!this.active.size) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.add(resolve));
  }
}
