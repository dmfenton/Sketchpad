"""OpenTelemetry tracing configuration for AWS X-Ray."""

import logging
from typing import Any

from opentelemetry import propagate, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.propagators.aws import AwsXRayPropagator
from opentelemetry.sdk.extension.aws.trace import AwsXRayIdGenerator
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from drawing_agent.config import settings

logger = logging.getLogger(__name__)


def setup_tracing(app: Any) -> None:
    """Initialize OpenTelemetry tracing with AWS X-Ray.

    Args:
        app: FastAPI application instance
    """
    if not settings.otel_enabled:
        logger.info("OpenTelemetry tracing disabled (set OTEL_ENABLED=true to enable)")
        return

    try:
        # Create resource with service info
        resource = Resource.create(
            {
                "service.name": settings.otel_service_name,
                "service.version": "1.0.0",
                "deployment.environment": "production" if not settings.dev_mode else "development",
            }
        )

        # Create tracer provider with X-Ray ID generator
        provider = TracerProvider(
            resource=resource,
            id_generator=AwsXRayIdGenerator(),
        )

        # Configure OTLP exporter to send to ADOT Collector
        # ADOT Collector receives OTLP and exports to X-Ray
        otlp_exporter = OTLPSpanExporter(
            endpoint=f"{settings.otel_exporter_endpoint}/v1/traces",
        )

        # Add batch processor for efficient export
        provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

        # Set as global tracer provider
        trace.set_tracer_provider(provider)

        # Set X-Ray propagator for distributed tracing
        propagate.set_global_textmap(AwsXRayPropagator())

        # Instrument FastAPI
        FastAPIInstrumentor.instrument_app(app)

        # Instrument SQLAlchemy (will auto-instrument when engine is created)
        SQLAlchemyInstrumentor().instrument()

        # Instrument logging to include trace IDs
        LoggingInstrumentor().instrument(set_logging_format=True)

        logger.info(
            f"OpenTelemetry tracing initialized: service={settings.otel_service_name}, "
            f"endpoint={settings.otel_exporter_endpoint}"
        )

    except Exception as e:
        logger.warning(f"Failed to initialize tracing (non-fatal): {e}")


def get_tracer(name: str) -> trace.Tracer:
    """Get a tracer instance for manual instrumentation.

    Args:
        name: Name for the tracer (typically module name)

    Returns:
        Tracer instance
    """
    return trace.get_tracer(name)


def get_current_trace_id() -> str | None:
    """Get the current trace ID if available.

    Returns:
        Trace ID as hex string, or None if no active span
    """
    span = trace.get_current_span()
    if span and span.get_span_context().is_valid:
        return format(span.get_span_context().trace_id, "032x")
    return None


def record_client_spans(spans: list[dict]) -> int:
    """Record spans received from mobile/web clients.

    Converts client span data to OpenTelemetry spans and exports them.

    Args:
        spans: List of span dicts from client with keys:
            - traceId: X-Ray format trace ID
            - spanId: 16 hex char span ID
            - name: Span name
            - startTime: Unix timestamp in ms
            - endTime: Unix timestamp in ms (optional)
            - attributes: Dict of attributes
            - status: 'ok' or 'error'
            - error: Error message (optional)

    Returns:
        Number of spans recorded
    """
    if not settings.otel_enabled:
        return 0

    tracer = get_tracer("mobile-client")
    recorded = 0

    for span_data in spans:
        try:
            # Create span with client-provided name and attributes
            name = span_data.get("name", "unknown")
            attributes = span_data.get("attributes", {})

            # Add client trace/span IDs as attributes for correlation
            attributes["client.trace_id"] = span_data.get("traceId", "")
            attributes["client.span_id"] = span_data.get("spanId", "")
            attributes["client.source"] = "mobile"

            # Calculate duration
            start_time = span_data.get("startTime", 0)
            end_time = span_data.get("endTime", start_time)
            duration_ms = end_time - start_time if end_time else 0
            attributes["duration_ms"] = duration_ms

            # Create the span
            with tracer.start_as_current_span(
                name,
                kind=trace.SpanKind.CLIENT,
            ) as span:
                # Set attributes
                for key, value in attributes.items():
                    if isinstance(value, str | int | float | bool):
                        span.set_attribute(key, value)

                # Set error status if applicable
                if span_data.get("status") == "error":
                    error_msg = span_data.get("error", "Unknown error")
                    span.set_status(trace.Status(trace.StatusCode.ERROR, error_msg))

            recorded += 1

        except Exception as e:
            logger.warning(f"Failed to record client span: {e}")

    return recorded
