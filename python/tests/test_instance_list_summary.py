"""Instance list summary environment_key (loxtep-sdk#123)."""

from loxtep.instance_list_summary import (
    resolve_environment_key,
    resolve_instance_type,
    to_instance_list_summary,
)


def _full(**overrides):
    base = {
        "instance_id": "i-abc",
        "organization_id": "org-secret",
        "name": "Patch Dev",
        "api_url": "https://apidev.loxtep.io",
        "region": "us-east-1",
        "stack_id": "arn:aws:cloudformation:...",
        "status": "active",
        "connection_details": {"instance_type": "customer"},
        "metadata": {"internal": True},
    }
    base.update(overrides)
    return base


def test_prunes_to_summary_fields():
    assert to_instance_list_summary(_full()) == {
        "instance_id": "i-abc",
        "name": "Patch Dev",
        "api_url": "https://apidev.loxtep.io",
        "region": "us-east-1",
        "status": "active",
        "instance_type": "self-hosted",
        "environment_key": None,
    }


def test_environment_key_from_metadata():
    assert (
        to_instance_list_summary(_full(metadata={"environment_key": "stage"}))[
            "environment_key"
        ]
        == "stage"
    )


def test_blank_environment_key_is_null_never_prod():
    assert resolve_environment_key(_full(metadata={"environment_key": "   "})) is None
    assert resolve_environment_key(_full(metadata={})) is None


def test_instance_type_prefers_metadata():
    assert (
        resolve_instance_type(
            _full(
                metadata={"instance_type": "managed"},
                connection_details={"instance_type": "shared"},
            )
        )
        == "managed"
    )
