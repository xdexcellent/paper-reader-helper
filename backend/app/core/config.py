from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    app_name: str = "paper-reader-backend"
    database_url: str = "sqlite:///./data/paper_reader.db"
    storage_root: str = "./data/storage"
    server_base_url: str = "http://localhost:8000"
    mineru_api_base: str = "https://mineru.net"
    mineru_api_token: str = ""
    deepseek_api_base: str = "https://api.deepseek.com"
    deepseek_api_key: str = ""
    cors_origins: str = "http://localhost:3000"
    jwt_secret: str = "paper-reader-secret-change-me"
    app_password: str = ""
    embedding_model_path: str = "BAAI/bge-m3"

    model_config = SettingsConfigDict(env_file=str(ENV_FILE), extra="ignore")


settings = Settings()
