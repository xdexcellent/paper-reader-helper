"""Local embedding generation using BGE-M3.

Gracefully degrades when sentence-transformers is not installed
(e.g., in desktop packaged mode where ML deps are excluded).
"""

import logging

logger = logging.getLogger(__name__)

# Check if sentence-transformers is available at import time.
# In desktop packaged mode, this dependency is excluded to keep
# bundle size under ~200MB. The embedding feature will return
# a clear error message instead of crashing.
_EMBEDDING_AVAILABLE: bool = False
_EMBEDDING_IMPORT_ERROR: str = ""

try:
    from sentence_transformers import SentenceTransformer
    _EMBEDDING_AVAILABLE = True
except ImportError as exc:
    _EMBEDDING_IMPORT_ERROR = str(exc)
    logger.info(
        "sentence-transformers is not installed — embedding features will be unavailable. "
        "Install it via: pip install sentence-transformers"
    )


class EmbeddingUnavailableError(RuntimeError):
    """Raised when embedding operations are requested but sentence-transformers is not installed."""

    def __init__(self) -> None:
        super().__init__(
            "Embedding feature is unavailable because sentence-transformers is not installed. "
            "To enable embedding, install it with:\n"
            "  pip install sentence-transformers\n"
            "Then restart the application. This is expected in the desktop packaged version "
            "where ML dependencies are excluded to reduce bundle size."
        )


class EmbeddingService:
    _model = None

    @classmethod
    def is_available(cls) -> bool:
        """Check if the embedding model is available.

        Returns False if sentence-transformers is not installed,
        allowing callers to provide graceful fallback behavior.
        """
        return _EMBEDDING_AVAILABLE

    @classmethod
    def get_model(cls):
        """Lazy load the sentence-transformers model.

        Raises:
            EmbeddingUnavailableError: If sentence-transformers is not installed.
        """
        if not _EMBEDDING_AVAILABLE:
            raise EmbeddingUnavailableError()

        if cls._model is None:
            from app.core.config import settings

            model_path = settings.embedding_model_path
            logger.info("Loading BGE-M3 model from: %s", model_path)
            cls._model = SentenceTransformer(model_path)
        return cls._model

    @classmethod
    def encode(cls, text: str) -> list[float]:
        """Encode a piece of text into a vector.

        Raises:
            EmbeddingUnavailableError: If sentence-transformers is not installed.
        """
        model = cls.get_model()
        vector = model.encode(text, normalize_embeddings=True)
        return vector.tolist()
