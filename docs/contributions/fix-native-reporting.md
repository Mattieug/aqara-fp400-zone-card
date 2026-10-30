# fix(native): reallocate reporting slots when native zones change

Based on bobtekkk/aqara-fp400-zone-card PR #9 at `f3b25bd6f6696c05b037c9ee9dba585d53f65bd6`.

When transitioning from zero to four native zones, illuminance retained a reporting slot and only three zones received spontaneous notifications. Allocate room presence first, native IDs in ascending order, then illuminance if a slot remains. Release previous managed/legacy lower-priority entries before adding new ones, and preserve polling fallback when an assignment fails.

Tested commit `43e3a66cf78168bd3551d6f85a1247f24627cb63`: 118/118 unit tests, including 0→4→8→2 zones and shuffled IDs. All tests use simulated devices; no physical FP400/coordinator validation was performed. This change should be applied to PR #9 or adapted after it merges, preserving the maintainer's PR #7 then #9 order.
