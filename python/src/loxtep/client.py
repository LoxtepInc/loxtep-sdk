"""
LoxtepClient (sync) and AsyncLoxtepClient (async).
Public surface: data_products, delivery, flows, workflows, observe, projects, templates, connectors, instances, procedures, domains, standards, data_contracts, connections, queues, quality, catalog, discovery, schemas, metrics.
"""

from typing import Any, Callable, Optional

from .catalog import AsyncCatalogApi, CatalogApi
from .connections import AsyncConnectionsApi, ConnectionsApi
from .connectors import AsyncConnectorsApi, ConnectorsApi
from .data_products import AsyncDataProductsApi, DataProductsApi
from .delivery import AsyncDeliveryApi, DeliveryApi
from .instances import AsyncInstancesApi, InstancesApi
from .procedures import AsyncProceduresApi, ProceduresApi
from .discovery import AsyncDiscoveryApi, DiscoveryApi
from .flows import AsyncFlowsApi, FlowsApi
from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient, RateLimitInfo
from .observe import AsyncObserveApi, ObserveApi
from .workflows import AsyncWorkflowsApi, WorkflowsApi
from .process_intelligence import AsyncProcessIntelligenceApi, ProcessIntelligenceApi
from .projects import AsyncProjectsApi, ProjectsApi
from .queues import AsyncQueuesApi, QueuesApi
from .quality import AsyncQualityApi, QualityApi
from .schemas import AsyncSchemasApi, SchemasApi
from .templates import AsyncTemplatesApi, TemplatesApi
from .stubs import data_contracts_stub, domains_stub, standards_stub


def _default_get_token() -> Optional[str]:
    return None


class LoxtepClient:
    """
    Sync Loxtep SDK client.
    data_products, flows, workflows, projects, connectors, instances, procedures, domains, standards, data_contracts, connections, queues, quality, catalog, discovery, schemas.
    """

    def __init__(
        self,
        api_url: str,
        auth: Optional[dict[str, Any]] = None,
        *,
        organization_id: Optional[str] = None,
        project_id: Optional[str] = None,
        get_token: Optional[Callable[[], Optional[str]]] = None,
        timeout: float = 30.0,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.auth = auth or {}
        self.organization_id = organization_id
        self.project_id = project_id
        token = self.auth.get("token") if isinstance(self.auth, dict) else None
        self._get_token = get_token or (lambda: token if isinstance(token, str) else None)
        self._http = LoxtepHttpClient(
            base_url=self.api_url,
            get_token=self._get_token,
            timeout=timeout,
        )
        self._queues = QueuesApi(self._http)
        self._connections = ConnectionsApi(self._http)
        self._flows = FlowsApi(self._http)
        self._workflows = WorkflowsApi(self._http)
        self._observe = ObserveApi(self._http)
        self._data_products = DataProductsApi(
            self._http,
            get_queue_metadata=lambda name: self._queues.get_queue_metadata(name),
            get_reader_checkpoint=lambda name, bot_id: self._queues.get_reader_checkpoint(name, bot_id),
        )
        self._quality = QualityApi(self._http)
        self._catalog = CatalogApi(self._http)
        self._discovery = DiscoveryApi(self._http)
        self._schemas = SchemasApi(self._http)
        self._process_intelligence = ProcessIntelligenceApi(self._http)
        self._projects = ProjectsApi(self._http)
        self._templates = TemplatesApi(self._http)
        self._connectors = ConnectorsApi(self._http)
        self._instances = InstancesApi(self._http)
        self._procedures = ProceduresApi(self._http)
        self._delivery = DeliveryApi(self._http)
        self.domains = domains_stub
        self.standards = standards_stub
        self.data_contracts = data_contracts_stub
        self.metrics = _MetricsStub()

    @property
    def templates(self) -> TemplatesApi:
        return self._templates

    @property
    def connectors(self) -> ConnectorsApi:
        return self._connectors

    @property
    def instances(self) -> InstancesApi:
        return self._instances

    @property
    def procedures(self) -> ProceduresApi:
        return self._procedures

    @property
    def data_products(self) -> DataProductsApi:
        return self._data_products

    @property
    def delivery(self) -> DeliveryApi:
        """Delivery interfaces API.

        Manage how data products deliver data to external systems.
        """
        return self._delivery

    @property
    def flows(self) -> FlowsApi:
        return self._flows

    @property
    def workflows(self) -> WorkflowsApi:
        return self._workflows

    @property
    def observe(self) -> ObserveApi:
        return self._observe

    @property
    def connections(self) -> ConnectionsApi:
        return self._connections

    @property
    def queues(self) -> QueuesApi:
        return self._queues

    @property
    def quality(self) -> QualityApi:
        return self._quality

    @property
    def catalog(self) -> CatalogApi:
        return self._catalog

    @property
    def discovery(self) -> DiscoveryApi:
        return self._discovery

    @property
    def schemas(self) -> SchemasApi:
        return self._schemas

    @property
    def process_intelligence(self) -> ProcessIntelligenceApi:
        return self._process_intelligence

    @property
    def projects(self) -> ProjectsApi:
        return self._projects

    def get_rate_limits(self) -> Optional[RateLimitInfo]:
        return self._http.get_last_rate_limit()

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "LoxtepClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class _MetricsStub:
    def log(self, metric: dict[str, Any]) -> None:
        pass

    def get_reporter(self) -> None:
        return None


class AsyncLoxtepClient:
    """
    Async Loxtep SDK client. Use async with.
    Same surface as LoxtepClient with async methods.
    """

    def __init__(
        self,
        api_url: str,
        auth: Optional[dict[str, Any]] = None,
        *,
        organization_id: Optional[str] = None,
        project_id: Optional[str] = None,
        get_token: Optional[Callable[[], Any]] = None,
        timeout: float = 30.0,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.auth = auth or {}
        self.organization_id = organization_id
        self.project_id = project_id
        token = self.auth.get("token") if isinstance(self.auth, dict) else None
        self._get_token = get_token or (lambda: token if isinstance(token, str) else None)
        self._http = AsyncLoxtepHttpClient(
            base_url=self.api_url,
            get_token=self._get_token,
            timeout=timeout,
        )
        self._queues = AsyncQueuesApi(self._http)
        self._connections = AsyncConnectionsApi(self._http)
        self._flows = AsyncFlowsApi(self._http)
        self._workflows = AsyncWorkflowsApi(self._http)
        self._observe = AsyncObserveApi(self._http)
        self._data_products = AsyncDataProductsApi(
            self._http,
            get_queue_metadata=None,
            get_reader_checkpoint=None,
        )
        self._quality = AsyncQualityApi(self._http)
        self._catalog = AsyncCatalogApi(self._http)
        self._discovery = AsyncDiscoveryApi(self._http)
        self._schemas = AsyncSchemasApi(self._http)
        self._process_intelligence = AsyncProcessIntelligenceApi(self._http)
        self._projects = AsyncProjectsApi(self._http)
        self._templates = AsyncTemplatesApi(self._http)
        self._connectors = AsyncConnectorsApi(self._http)
        self._instances = AsyncInstancesApi(self._http)
        self._procedures = AsyncProceduresApi(self._http)
        self._delivery = AsyncDeliveryApi(self._http)
        self.domains = domains_stub
        self.standards = standards_stub
        self.data_contracts = data_contracts_stub
        self.metrics = _MetricsStub()

    @property
    def connectors(self) -> AsyncConnectorsApi:
        return self._connectors

    @property
    def instances(self) -> AsyncInstancesApi:
        return self._instances

    @property
    def procedures(self) -> AsyncProceduresApi:
        return self._procedures

    @property
    def data_products(self) -> AsyncDataProductsApi:
        return self._data_products

    @property
    def delivery(self) -> AsyncDeliveryApi:
        """Delivery interfaces API.

        Manage how data products deliver data to external systems.
        """
        return self._delivery

    @property
    def flows(self) -> AsyncFlowsApi:
        return self._flows

    @property
    def workflows(self) -> AsyncWorkflowsApi:
        return self._workflows

    @property
    def observe(self) -> AsyncObserveApi:
        return self._observe

    @property
    def connections(self) -> AsyncConnectionsApi:
        return self._connections

    @property
    def queues(self) -> AsyncQueuesApi:
        return self._queues

    @property
    def quality(self) -> AsyncQualityApi:
        return self._quality

    @property
    def catalog(self) -> AsyncCatalogApi:
        return self._catalog

    @property
    def discovery(self) -> AsyncDiscoveryApi:
        return self._discovery

    @property
    def schemas(self) -> AsyncSchemasApi:
        return self._schemas

    @property
    def process_intelligence(self) -> AsyncProcessIntelligenceApi:
        return self._process_intelligence

    @property
    def projects(self) -> AsyncProjectsApi:
        return self._projects

    @property
    def templates(self) -> AsyncTemplatesApi:
        return self._templates

    def get_rate_limits(self) -> Optional[RateLimitInfo]:
        return self._http.get_last_rate_limit()

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncLoxtepClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()
