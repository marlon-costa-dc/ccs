# CCS Project Roadmap

Beads is the execution source of truth for active CCS work, priorities,
dependencies, ownership, and completion. This file intentionally contains no
copied backlog, milestone plan, or status snapshot.

## Current work

- In a governed Gas Town lane, run `gt prime`, inspect `gt hook`, then read the
  assigned bead with `bd show <id>`.
- Outside a hooked lane, use `bd ready` to find unblocked work and `bd show
  <id>` before claiming it.
- GitHub issues are the public intake and mirror. Pull requests are review
  artifacts, and releases record shipped results; none replaces Beads for
  governed execution state.

Repository workflow lives in [AGENTS.md](../AGENTS.md) and
[CONTRIBUTING.md](../CONTRIBUTING.md). Architecture and product direction live
in the documents mapped by the [maintainer documentation index](./README.md).
