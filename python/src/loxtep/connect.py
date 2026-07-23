"""Connect facade (MCP: loxtep_connect)."""

from __future__ import annotations

from dataclasses import dataclass

from .connectors import ConnectorsApi
from .templates import TemplatesApi


@dataclass(frozen=True)
class ConnectFacade:
    connectors: ConnectorsApi
    templates: TemplatesApi
