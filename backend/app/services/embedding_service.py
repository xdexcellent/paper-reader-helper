"""Local embedding generation using BGE-M3."""

import logging

logger = logging.getLogger(__name__)

class EmbeddingService:
    _model = None

    @classmethod
    def get_model(cls):
        """Lazy load the sentence-transformers model to avoid heavy imports at startup."""
        if cls._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                from app.core.config import settings
                
                model_path = settings.embedding_model_path
                logger.info(f"Loading BGE-M3 model from: {model_path}")
                cls._model = SentenceTransformer(model_path)
            except ImportError as e:
                raise RuntimeError(
                    "sentence-transformers is not installed. "
                    "Install it via `uv add sentence-transformers` to use local embeddings."
                ) from e
        return cls._model

    @classmethod
    def encode(cls, text: str) -> list[float]:
        """Encode a piece of text into a vector."""
        model = cls.get_model()
        vector = model.encode(text, normalize_embeddings=True)
        return vector.tolist()
