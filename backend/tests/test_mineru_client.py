from app.services.mineru_client import MineruClient


def test_make_pdf_url_encodes_special_characters() -> None:
    client = MineruClient(
        server_base_url="https://mineru.753939.xyz",
        storage_root="E:/tmp/paper-reader-helper/backend/data/storage",
    )

    url = client._make_pdf_url(
        "E:/tmp/paper-reader-helper/backend/data/storage/papers/abc123/MRI Super-Resolution with Partial Diffusion Models(科研通-ablesci.com).pdf"
    )

    assert url == (
        "https://mineru.753939.xyz/files/papers/abc123/"
        "MRI%20Super-Resolution%20with%20Partial%20Diffusion%20Models%28%E7%A7%91%E7%A0%94%E9%80%9A-ablesci.com%29.pdf"
    )
