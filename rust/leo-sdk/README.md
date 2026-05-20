# leo-sdk (Rust)

Placeholder crate for the **rstreams/Leo Rust SDK**. Rust Lambda bots are
currently **blocked on this SDK** for runtime read/write/checkpoint behavior.

- **Spec and status**: See
  [RUST_BOT_RUNTIME_AND_SDK.md](../../_docs/rust/RUST_BOT_RUNTIME_AND_SDK.md) in
  the platform-backend repo. That doc states the block, lists required API
  surface (bus config, load queue, read events, checkpoint, write to
  destination/error), env vars, and references Node/Python behavior.
- **Deploy-ms**: Registration and build of Rust bots are supported; only the
  in-handler queue operations require this crate to be implemented.
- **Tracking**: Implementation progress for the full SDK is tracked in Linear:
  [LOX-1166](https://linear.app/loxtepinc/issue/LOX-1166).

This crate will eventually provide the same capabilities as the Node `leo-sdk`
and `_core/offload-wrapper.ts` / `web-wrapper.ts` patterns.
