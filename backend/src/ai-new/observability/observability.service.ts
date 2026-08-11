import { Injectable, Logger } from '@nestjs/common';

export interface LayerSpan {
  layerName: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

export interface TraceData {
  traceId: string;
  spans: LayerSpan[];
  totalDurationMs?: number;
}

export interface AiMetrics {
  totalRequests: number;
  successCount: number;
  errorCounts: Record<string, number>;
  totalLlmCostUsd: number;
  totalTokensUsed: number;
  averageConfidence: number;
  sumConfidence: number; // for calculating average
  averageLatencyMs: number;
  sumLatencyMs: number;
  hallucinationBlocks: number;
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  
  // In-memory trace store (in production, this would be exported to Jaeger/Zipkin via OpenTelemetry)
  private activeTraces = new Map<string, TraceData>();
  
  // In-memory metrics aggregation (in production, this would be exported to Prometheus)
  private metrics: AiMetrics = {
    totalRequests: 0,
    successCount: 0,
    errorCounts: {
      CLARIFICATION_REQUIRED: 0,
      NO_DATA: 0,
      PERMISSION_DENIED: 0,
      VALIDATION_FAILED: 0,
      INTERNAL_ERROR: 0
    },
    totalLlmCostUsd: 0,
    totalTokensUsed: 0,
    averageConfidence: 0,
    sumConfidence: 0,
    averageLatencyMs: 0,
    sumLatencyMs: 0,
    hallucinationBlocks: 0
  };

  /**
   * Initializes a trace for a new request.
   */
  public startTrace(traceId: string) {
    this.activeTraces.set(traceId, { traceId, spans: [] });
    this.logger.debug(`[TRACE START] ${traceId}`);
  }

  /**
   * Starts a span for a specific layer.
   */
  public startSpan(traceId: string, layerName: string) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;
    trace.spans.push({
      layerName,
      startTime: performance.now()
    });
  }

  /**
   * Ends a span for a specific layer and computes its duration.
   */
  public endSpan(traceId: string, layerName: string) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;
    const span = trace.spans.find(s => s.layerName === layerName && !s.endTime);
    if (span) {
      span.endTime = performance.now();
      span.durationMs = Math.round(span.endTime - span.startTime);
      this.logger.debug(`[SPAN END] ${traceId} - ${layerName} took ${span.durationMs}ms`);
    }
  }

  /**
   * Finalizes the trace, logs the summary, and updates global metrics.
   */
  public endTrace(
    traceId: string, 
    status: string, 
    confidence: number, 
    isFallback: boolean, 
    totalLatencyMs: number
  ) {
    const trace = this.activeTraces.get(traceId);
    if (trace) {
      trace.totalDurationMs = totalLatencyMs;
    }

    // Update global metrics
    this.metrics.totalRequests++;
    this.metrics.sumLatencyMs += totalLatencyMs;
    this.metrics.averageLatencyMs = Math.round(this.metrics.sumLatencyMs / this.metrics.totalRequests);
    
    this.metrics.sumConfidence += confidence;
    this.metrics.averageConfidence = parseFloat((this.metrics.sumConfidence / this.metrics.totalRequests).toFixed(2));

    if (status === 'SUCCESS') {
      this.metrics.successCount++;
    } else {
      if (this.metrics.errorCounts[status] !== undefined) {
        this.metrics.errorCounts[status]++;
      } else {
        this.metrics.errorCounts[status] = 1;
      }
    }

    if (isFallback) {
      this.metrics.hallucinationBlocks++;
    }

    // Structured Log
    this.logger.log(`[TRACE END] ${traceId} | Status: ${status} | Latency: ${totalLatencyMs}ms | Confidence: ${confidence} | Blocked: ${isFallback}`);
    
    // Cleanup active trace to prevent memory leak (in a real system we might archive it)
    this.activeTraces.delete(traceId);
  }

  /**
   * Records LLM cost and token usage (called by LLM Service).
   */
  public recordLlmUsage(tokens: number, estimatedCostUsd: number) {
    this.metrics.totalTokensUsed += tokens;
    this.metrics.totalLlmCostUsd += estimatedCostUsd;
    this.logger.debug(`[LLM USAGE] Tokens: ${tokens}, Cost: $${estimatedCostUsd.toFixed(6)}`);
  }

  /**
   * Returns current aggregated metrics for dashboards.
   */
  public getMetrics(): AiMetrics {
    return this.metrics;
  }
}
