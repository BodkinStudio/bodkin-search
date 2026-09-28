# Escalation: recovery across a report-month rollover

## Trigger

Static interaction review found a concurrency boundary that the accepted plan
did not cover. An uncertain build begun before local month rollover could be
checked or retried afterward using only `projectId`; the server would then
derive a different previous-month coordinate while the UI promised recovery of
the original frozen version.

## Evidence

- The client kept no submitted period coordinate.
- Both read and build server functions accepted only `projectId` and derived
  their period from the time of each independent request.
- The immutable Report coordinate includes period start/end, so this drift can
  make a persisted winner invisible or create the new month's Report instead.

## Revised decision

The UI echoes the exact period start/end and report timezone issued by the
server when explicitly building or recovering. The authorized service permits
only an adjacent recovery-month coordinate, reads and returns any existing
winner, and creates a Report only when both echoed period and timezone still
equal the server-derived current eligible values. If no old winner exists after
month or timezone rollover, it returns the current read state without a write.
The echoed timezone is an expectation, not authority: cutoff, actor, version,
sources, content and the timezone actually used remain server-owned.

This is the smallest change that preserves exact recovery without adding a
session, token store, historical build authority or client-selected report
generation.
