"""Shared HTTP client factory with proxy support."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_proxy_settings() -> dict[str, str | None]:
    """Get proxy settings from database or environment."""
    # Lazy imports to avoid circular dependency
    try:
        from sqlmodel import Session
        from app.core.db import engine
        from app.services.automation_settings_service import AutomationSettingsService
        with Session(engine) as session:
            auto_settings = AutomationSettingsService.get_settings(session)
            return {
                "http_proxy": auto_settings.http_proxy,
                "https_proxy": auto_settings.https_proxy,
            }
    except Exception:
        logger.debug("Could not load proxy settings from DB, using env vars")
        return {
            "http_proxy": settings.http_proxy,
            "https_proxy": settings.https_proxy,
        }


def _build_proxy_mounts(http_proxy: str | None, https_proxy: str | None) -> dict[str, Any] | None:
    """Build proxy mounts for httpx client."""
    proxies: dict[str, Any] = {}
    if http_proxy:
        proxies["http://"] = httpx.HTTPTransport(proxy=http_proxy)
    if https_proxy:
        proxies["https://"] = httpx.HTTPTransport(proxy=https_proxy)
    return proxies if proxies else None


def get_http_client(
    *,
    timeout: float = 30.0,
    follow_redirects: bool = True,
    use_db_proxy: bool = True,
) -> httpx.Client:
    """Create an HTTP client with proxy support.

    Args:
        timeout: Request timeout in seconds
        follow_redirects: Whether to follow redirects
        use_db_proxy: Whether to load proxy settings from DB (fallback to env vars)

    Returns:
        httpx.Client configured with proxies if available
    """
    if use_db_proxy:
        proxy_settings = _get_proxy_settings()
        http_proxy = proxy_settings.get("http_proxy")
        https_proxy = proxy_settings.get("https_proxy")
    else:
        http_proxy = settings.http_proxy
        https_proxy = settings.https_proxy

    mounts = _build_proxy_mounts(http_proxy, https_proxy)

    if mounts:
        logger.debug("Creating HTTP client with proxy: http=%s, https=%s", http_proxy, https_proxy)
        return httpx.Client(
            mounts=mounts,
            timeout=timeout,
            follow_redirects=follow_redirects,
        )
    return httpx.Client(timeout=timeout, follow_redirects=follow_redirects)


def get_httpx_get_kwargs(use_db_proxy: bool = True) -> dict[str, Any]:
    """Get kwargs dict for httpx.get() with proxy support.

    Usage:
        httpx.get(url, **get_httpx_get_kwargs())
    """
    if use_db_proxy:
        proxy_settings = _get_proxy_settings()
        http_proxy = proxy_settings.get("http_proxy")
        https_proxy = proxy_settings.get("https_proxy")
    else:
        http_proxy = settings.http_proxy
        https_proxy = settings.https_proxy

    kwargs: dict[str, Any] = {}
    if http_proxy or https_proxy:
        # For httpx.get, we use the proxies dict format
        proxies: dict[str, str] = {}
        if http_proxy:
            proxies["http://"] = http_proxy
        if https_proxy:
            proxies["https://"] = https_proxy
        if proxies:
            kwargs["proxies"] = proxies
            logger.debug("httpx.get with proxy: %s", proxies)
    return kwargs
