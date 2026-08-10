"""
LoxtepClient (sync) and AsyncLoxtepClient (async).
Ten MCP-aligned namespaces: session, connect, workspace, build, define, meaning, review, query, observe, context.
Top-level get_writer / get_reader delegate to data-products stream logic.
"""

from typing import Any, Callable, Mapping, Optional

from .activity import AsyncActivityApi, ActivityApi
from .agent_workspace import (
    AsyncGoalsApi,
    AsyncIssuesApi,
    AsyncWorkstreamsApi,
    GoalsApi,
    IssuesApi,
    WorkstreamsApi,
)
from .approvals import ApprovalsApi, AsyncApprovalsApi
from .build import BuildFacade
from .catalog import AsyncCatalogApi, CatalogApi
from .connect import ConnectFacade
from .connectors import AsyncConnectorsApi, ConnectorsApi
from .context import ContextFacade
from .data_contracts import AsyncDataContractsApi, DataContractsApi
from .data_products import AsyncDataProductsApi, DataProductsApi
from .define import DefineFacade
from .deployments import AsyncDeploymentsApi, DeploymentsApi
from .discovery import AsyncDiscoveryApi, DiscoveryApi
from .domains import AsyncDomainsApi, DomainsApi
from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient, RateLimitInfo
from .improvements import AsyncImprovementsApi, ImprovementsApi
from .instances import AsyncInstancesApi, InstancesApi
from .meaning import MeaningFacade
from .observe import AsyncObserveApi, ObserveApi
from .observe_facade import ObserveFacade
from .procedures import AsyncProceduresApi, ProceduresApi
from .process_intelligence import AsyncProcessIntelligenceApi, ProcessIntelligenceApi
from .projects import AsyncProjectsApi, ProjectsApi
from .quality import AsyncQualityApi, QualityApi
from .query import QueryFacade
from .queues import AsyncQueuesApi, QueuesApi
from .review import ReviewFacade
from .rstreams import resolve_stream_config
from .schemas import AsyncSchemasApi, SchemasApi
from .session import SessionApi
from .standards import AsyncStandardsApi, StandardsApi
from .targets import AsyncTargetsApi, TargetsApi
from .templates import AsyncTemplatesApi, TemplatesApi
from .thesaurus import AsyncThesaurusApi, ThesaurusApi
from .triggers import AsyncTriggersApi, TriggersApi
from .workspace import WorkspaceFacade
from .workspace_config import require_auto_config, resolve_auto_config, streams_with_region
from .workflows import AsyncWorkflowsApi, WorkflowsApi


def _default_get_token() -> Optional[str]:
    return None


def _client_from_auto_config(
    *,
    cwd: Optional[str] = None,
    api_url: Optional[str] = None,
    project_id: Optional[str] = None,
    instance_id: Optional[str] = None,
    organization_id: Optional[str] = None,
    region: Optional[str] = None,
    token: Optional[str] = None,
    streams: Optional[Mapping[str, Any]] = None,
    timeout: float = 30.0,
    async_client: bool = False,
) -> Any:
    """Shared resolution for ``from_workspace`` (sync + async)."""
    explicit: dict[str, Any] = {}
    if api_url:
        explicit["api_url"] = api_url
    if project_id:
        explicit["project_id"] = project_id
    if instance_id:
        explicit["instance_id"] = instance_id
    if organization_id:
        explicit["organization_id"] = organization_id
    if region:
        explicit["region"] = region
    if token:
        explicit["token"] = token
    if streams:
        explicit["streams"] = dict(streams)

    resolved = require_auto_config(resolve_auto_config(explicit, cwd))
    merged_streams = streams_with_region(resolved.streams, resolved.region)
    ctor = AsyncLoxtepClient if async_client else LoxtepClient
    return ctor(
        api_url=resolved.api_url,
        auth={"type": "jwt", "token": resolved.token},
        organization_id=resolved.organization_id,
        project_id=resolved.project_id,
        instance_id=resolved.instance_id,
        region=resolved.region,
        streams=merged_streams,
        timeout=timeout,
    )


class LoxtepClient:
    """Sync Loxtep SDK client with ten MCP-aligned namespaces."""

    def __init__(
        self,
        api_url: str,
        auth: Optional[dict[str, Any]] = None,
        *,
        organization_id: Optional[str] = None,
        project_id: Optional[str] = None,
        instance_id: Optional[str] = None,
        region: Optional[str] = None,
        get_token: Optional[Callable[[], Optional[str]]] = None,
        timeout: float = 30.0,
        streams: Optional[dict[str, Any]] = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.auth = auth or {}
        self.organization_id = organization_id
        self.project_id = project_id
        self.instance_id = instance_id
        self.region = region
        token = self.auth.get("token") if isinstance(self.auth, dict) else None
        self._get_token = get_token or (lambda: token if isinstance(token, str) else None)
        self._http = LoxtepHttpClient(
            base_url=self.api_url,
            get_token=self._get_token,
            timeout=timeout,
        )
        self._stream_config = resolve_stream_config(streams_with_region(streams, region) or streams)
        queues = QueuesApi(self._http)
        triggers = TriggersApi(self._http)
        workflows = WorkflowsApi(self._http, stream_config=self._stream_config)
        projects = ProjectsApi(self._http)
        templates = TemplatesApi(self._http)
        observe = ObserveApi(self._http)
        deployments = DeploymentsApi(self._http)
        data_products = DataProductsApi(
            self._http,
            get_queue_metadata=lambda name: queues.get_queue_metadata(name),
            get_reader_checkpoint=lambda name, bot_id: queues.get_reader_checkpoint(name, bot_id),
            stream_config=self._stream_config,
        )
        self._data_products = data_products

        self.session = SessionApi(self._http)
        self.connect = ConnectFacade(
            connectors=ConnectorsApi(self._http),
            templates=templates,
        )
        self.workspace = WorkspaceFacade(
            projects=projects,
            instances=InstancesApi(self._http),
            deployments=deployments,
        )
        self.build = BuildFacade(
            workflows=workflows,
            triggers=triggers,
            data_products=data_products,
            targets=TargetsApi(self._http),
        )
        self.define = DefineFacade(
            schemas=SchemasApi(self._http),
            quality=QualityApi(self._http),
            standards=StandardsApi(self._http),
            data_contracts=DataContractsApi(self._http),
            domains=DomainsApi(self._http),
        )
        self.meaning = MeaningFacade(thesaurus=ThesaurusApi(self._http, organization_id))
        self.review = ReviewFacade(
            approvals=ApprovalsApi(self._http, organization_id=organization_id),
            improvements=ImprovementsApi(self._http),
        )
        self.query = QueryFacade(
            catalog=CatalogApi(self._http),
            discovery=DiscoveryApi(self._http),
            _query=data_products.query,
            _list_tables=data_products.list_tables,
            _search=data_products.search,
        )
        self.observe = ObserveFacade(
            _status=observe.status,
            _stream_config=observe.stream_config,
            _get_queue_metadata=queues.get_queue_metadata,
            _get_reader_checkpoint=queues.get_reader_checkpoint,
            _open_reader=queues.open_reader,
            _open_writer=queues.open_writer,
            deployments=deployments,
        )
        self.context = ContextFacade(
            process_intelligence=ProcessIntelligenceApi(self._http),
            procedures=ProceduresApi(self._http),
            activity=ActivityApi(self._http),
            issues=IssuesApi(self._http, organization_id=organization_id),
            goals=GoalsApi(self._http, organization_id=organization_id),
            workstreams=WorkstreamsApi(self._http, organization_id=organization_id),
        )
        self.metrics = _MetricsStub()

    @classmethod
    def from_workspace(
        cls,
        *,
        cwd: Optional[str] = None,
        api_url: Optional[str] = None,
        project_id: Optional[str] = None,
        instance_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        region: Optional[str] = None,
        token: Optional[str] = None,
        streams: Optional[Mapping[str, Any]] = None,
        timeout: float = 30.0,
    ) -> "LoxtepClient":
        """Build a client from ``.loxtep/project.json`` + credentials (env wins).

        Precedence: ``LOXTEP_*`` env vars > explicit kwargs > workspace files.
        Raises ``ValidationError`` when ``api_url`` or auth token cannot be resolved.
        """
        return _client_from_auto_config(
            cwd=cwd,
            api_url=api_url,
            project_id=project_id,
            instance_id=instance_id,
            organization_id=organization_id,
            region=region,
            token=token,
            streams=streams,
            timeout=timeout,
            async_client=False,
        )

    def get_writer(self, name_or_id: str, **options: Any) -> Any:
        return self._data_products.get_writer(name_or_id, **options)

    def get_reader(self, name_or_id: str, **options: Any) -> Any:
        return self._data_products.get_reader(name_or_id, **options)

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
    """Async Loxtep SDK client. Same ten namespaces as LoxtepClient."""

    def __init__(
        self,
        api_url: str,
        auth: Optional[dict[str, Any]] = None,
        *,
        organization_id: Optional[str] = None,
        project_id: Optional[str] = None,
        instance_id: Optional[str] = None,
        region: Optional[str] = None,
        get_token: Optional[Callable[[], Any]] = None,
        timeout: float = 30.0,
        streams: Optional[dict[str, Any]] = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.auth = auth or {}
        self.organization_id = organization_id
        self.project_id = project_id
        self.instance_id = instance_id
        self.region = region
        self._stream_config = resolve_stream_config(streams_with_region(streams, region) or streams)
        token = self.auth.get("token") if isinstance(self.auth, dict) else None
        self._get_token = get_token or (lambda: token if isinstance(token, str) else None)
        self._http = AsyncLoxtepHttpClient(
            base_url=self.api_url,
            get_token=self._get_token,
            timeout=timeout,
        )
        queues = AsyncQueuesApi(self._http)
        triggers = AsyncTriggersApi(self._http)
        workflows = AsyncWorkflowsApi(self._http, stream_config=self._stream_config)
        projects = AsyncProjectsApi(self._http)
        templates = AsyncTemplatesApi(self._http)
        observe = AsyncObserveApi(self._http)
        deployments = AsyncDeploymentsApi(self._http)
        data_products = AsyncDataProductsApi(
            self._http,
            get_queue_metadata=None,
            get_reader_checkpoint=None,
            stream_config=self._stream_config,
        )
        self._data_products = data_products

        self.session = SessionApi(self._http)  # type: ignore[arg-type]
        self.connect = ConnectFacade(
            connectors=AsyncConnectorsApi(self._http),
            templates=templates,
        )
        self.workspace = WorkspaceFacade(
            projects=projects,
            instances=AsyncInstancesApi(self._http),
            deployments=deployments,
        )
        self.build = BuildFacade(
            workflows=workflows,
            triggers=triggers,
            data_products=data_products,
            targets=AsyncTargetsApi(self._http),
        )
        self.define = DefineFacade(
            schemas=AsyncSchemasApi(self._http),
            quality=AsyncQualityApi(self._http),
            standards=AsyncStandardsApi(self._http),
            data_contracts=AsyncDataContractsApi(self._http),
            domains=AsyncDomainsApi(self._http),
        )
        self.meaning = MeaningFacade(thesaurus=AsyncThesaurusApi(self._http, organization_id))
        self.review = ReviewFacade(
            approvals=AsyncApprovalsApi(self._http, organization_id=organization_id),
            improvements=AsyncImprovementsApi(self._http),
        )
        self.query = QueryFacade(
            catalog=AsyncCatalogApi(self._http),
            discovery=AsyncDiscoveryApi(self._http),
            _query=data_products.query,
            _list_tables=data_products.list_tables,
            _search=data_products.search,
        )
        self.observe = ObserveFacade(
            _status=observe.status,
            _stream_config=observe.stream_config,
            _get_queue_metadata=queues.get_queue_metadata,
            _get_reader_checkpoint=queues.get_reader_checkpoint,
            _open_reader=queues.open_reader,
            _open_writer=queues.open_writer,
            deployments=deployments,
        )
        self.context = ContextFacade(
            process_intelligence=AsyncProcessIntelligenceApi(self._http),
            procedures=AsyncProceduresApi(self._http),
            activity=AsyncActivityApi(self._http),
            issues=AsyncIssuesApi(self._http, organization_id=organization_id),
            goals=AsyncGoalsApi(self._http, organization_id=organization_id),
            workstreams=AsyncWorkstreamsApi(self._http, organization_id=organization_id),
        )
        self.metrics = _MetricsStub()

    @classmethod
    def from_workspace(
        cls,
        *,
        cwd: Optional[str] = None,
        api_url: Optional[str] = None,
        project_id: Optional[str] = None,
        instance_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        region: Optional[str] = None,
        token: Optional[str] = None,
        streams: Optional[Mapping[str, Any]] = None,
        timeout: float = 30.0,
    ) -> "AsyncLoxtepClient":
        """Build an async client from workspace files. See ``LoxtepClient.from_workspace``."""
        return _client_from_auto_config(
            cwd=cwd,
            api_url=api_url,
            project_id=project_id,
            instance_id=instance_id,
            organization_id=organization_id,
            region=region,
            token=token,
            streams=streams,
            timeout=timeout,
            async_client=True,
        )

    async def get_writer(self, name_or_id: str, **options: Any) -> Any:
        return await self._data_products.get_writer(name_or_id, **options)

    async def get_reader(self, name_or_id: str, **options: Any) -> Any:
        return await self._data_products.get_reader(name_or_id, **options)

    def get_rate_limits(self) -> Optional[RateLimitInfo]:
        return self._http.get_last_rate_limit()

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncLoxtepClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()
