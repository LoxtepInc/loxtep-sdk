"""Observe facade (MCP: loxtep_observe)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .observe import ObserveApi


@dataclass
class ObserveFacade:
    _status: Callable[[], Any]
    _stream_config: Callable[[], Any]
    _get_queue_metadata: Callable[..., Any]
    _get_reader_checkpoint: Callable[..., Any]
    _open_reader: Callable[..., Any]
    _open_writer: Callable[..., Any]

    def status(self) -> Any:
        return self._status()

    def stream_config(self) -> Any:
        return self._stream_config()

    def get_queue_metadata(self, *args: Any, **kwargs: Any) -> Any:
        return self._get_queue_metadata(*args, **kwargs)

    def get_reader_checkpoint(self, *args: Any, **kwargs: Any) -> Any:
        return self._get_reader_checkpoint(*args, **kwargs)

    def open_reader(self, *args: Any, **kwargs: Any) -> Any:
        return self._open_reader(*args, **kwargs)

    def open_writer(self, *args: Any, **kwargs: Any) -> Any:
        return self._open_writer(*args, **kwargs)
