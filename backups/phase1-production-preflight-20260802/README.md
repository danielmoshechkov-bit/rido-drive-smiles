# Phase 1 production preflight backup

Read-only download from project `wclrrytmrscqvsyxyvnn` on 2026-08-02.
No deploy, database write, secret change or telephony operation was performed.

- `rollback-voice-agent-chat` contains the exact active entrypoint and both
  shared files downloaded with version 25. Remote `verify_jwt` was `false`.
- `rollback-voice-agent-llm` contains the exact active entrypoint and shared
  secret reader downloaded with version 19. Remote `verify_jwt` was `false`.

Before any rollback, run `shasum -a 256 -c SHA256SUMS` inside the selected
directory. Deploying requires separate explicit approval. Preserve
`verify_jwt=false`; changing it would break the existing ElevenLabs/custom
authorization contract.

The downloaded Git blob IDs match both `origin/main` at
`bddb944095f46657889bf6e1bd9da44ffc66ebed` and the local base commit for all
files in these two bundles.
