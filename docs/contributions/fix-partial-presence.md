# fix(zones): suspend absence confirmation when positions are incomplete

An absence timer already running continued through a frame with missing positions, allowing a zone to become empty from incomplete observations. Cancel that timer while positions are incomplete. A complete snapshot starts a fresh full delay; confirmed room absence still clears presence. Observed targets can still confirm occupancy.

Tested commit `51108d4286b9eb9d0d0e9905aafb32f1c7f952d0`: 87/87 unit tests. Regression covers missing targets, retained target positions and resuming after a complete snapshot.

No physical FP400, Home Assistant installation or coordinator was used or modified. Tests run with Node 22.20.0 and the repository's pinned dependencies. No hardware validation is claimed.
