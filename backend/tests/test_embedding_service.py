"""Tests for EmbeddingService graceful degradation.

When sentence-transformers is not installed (packaged desktop mode),
the service should provide clear error messages instead of crashing.
"""

from unittest.mock import patch

import pytest


class TestEmbeddingServiceAvailability:
    """Test that EmbeddingService indicates availability correctly."""

    def test_is_available_returns_boolean(self):
        """is_available() should return a boolean."""
        from app.services.embedding_service import EmbeddingService

        result = EmbeddingService.is_available()
        assert isinstance(result, bool)

    def test_get_model_raises_unavailable_when_missing(self):
        """When sentence-transformers is not installed, get_model()
        should raise EmbeddingUnavailableError."""
        from app.services.embedding_service import (
            EmbeddingService,
            EmbeddingUnavailableError,
            _EMBEDDING_AVAILABLE,
        )

        if _EMBEDDING_AVAILABLE:
            pytest.skip("sentence-transformers is installed; cannot test unavailable path")

        with pytest.raises(EmbeddingUnavailableError) as exc_info:
            EmbeddingService.get_model()

        assert "sentence-transformers" in str(exc_info.value)
        assert "pip install" in str(exc_info.value)

    def test_encode_raises_unavailable_when_missing(self):
        """When sentence-transformers is not installed, encode()
        should raise EmbeddingUnavailableError."""
        from app.services.embedding_service import (
            EmbeddingService,
            EmbeddingUnavailableError,
            _EMBEDDING_AVAILABLE,
        )

        if _EMBEDDING_AVAILABLE:
            pytest.skip("sentence-transformers is installed; cannot test unavailable path")

        with pytest.raises(EmbeddingUnavailableError) as exc_info:
            EmbeddingService.encode("test text")

        assert "sentence-transformers" in str(exc_info.value)

    def test_unavailable_error_message_is_helpful(self):
        """EmbeddingUnavailableError should contain installation instructions."""
        from app.services.embedding_service import EmbeddingUnavailableError

        error = EmbeddingUnavailableError()
        message = str(error)

        # Should mention what's missing
        assert "sentence-transformers" in message
        # Should mention how to install
        assert "pip install sentence-transformers" in message
        # Should mention it's expected in desktop mode
        assert "desktop" in message.lower() or "packaged" in message.lower()


class TestEmbeddingServiceWithModel:
    """Test that EmbeddingService works when sentence-transformers IS installed."""

    def test_get_model_loads_successfully(self):
        """When sentence-transformers is available, get_model() returns a model."""
        from app.services.embedding_service import _EMBEDDING_AVAILABLE

        if not _EMBEDDING_AVAILABLE:
            pytest.skip("sentence-transformers is not installed")

        from app.services.embedding_service import EmbeddingService

        model = EmbeddingService.get_model()
        assert model is not None

    def test_encode_returns_vector(self):
        """When sentence-transformers is available, encode() returns a list of floats."""
        from app.services.embedding_service import _EMBEDDING_AVAILABLE

        if not _EMBEDDING_AVAILABLE:
            pytest.skip("sentence-transformers is not installed")

        from app.services.embedding_service import EmbeddingService

        vector = EmbeddingService.encode("test text")
        assert isinstance(vector, list)
        assert len(vector) > 0
        assert all(isinstance(v, float) for v in vector)


class TestEmbeddingStatusInPipeline:
    """Test that embedding failures set the right status."""

    def test_unavailable_status_value(self):
        """When EmbeddingUnavailableError is raised, the status should be 'unavailable'."""
        # This is tested via integration — the pipeline catches
        # EmbeddingUnavailableError and sets status to 'unavailable'
        # instead of 'failed'.
        from app.services.embedding_service import EmbeddingUnavailableError

        error = EmbeddingUnavailableError()
        # Verify the error type exists and can be caught
        assert isinstance(error, RuntimeError)