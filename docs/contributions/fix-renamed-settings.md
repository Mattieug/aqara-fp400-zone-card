# fix(card): write settings through the entity registry after renames

Renaming a setting in Home Assistant leaves the control readable but its change no longer matches the hard-coded entity ID. Resolve the write descriptor through the same entity-registry lookup used for rendering, preserving device scoping.

Tested commit `2a0929740c3d8def8a871c142ad2574120f19813`: 86/86 unit tests; browser RENAMED scenario 4/4 assertions for administrator and ordinary users. The new regression fails before the fix.

No physical FP400, Home Assistant installation or coordinator was used or modified. Tests run with Node 22.20.0 and the repository's pinned dependencies. No hardware validation is claimed.
