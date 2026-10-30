# ci: run the existing browser scenarios alongside unit tests

The browser tests cover editor interactions and confirmed writes but were not run by Validate. Add a separate Node 22 job using the pinned local Playwright CLI and Chromium headless shell, with a 15-minute timeout.

Tested commit `533728084a8a864856bbbec4d7865b99ce530f63`: 84/84 unit tests. Chromium headless shell installation and browser execution were verified locally with Node 22; the combined PR #7/#9 integration exercises the expanded scenarios separately. GitHub's first-contributor workflow approval, if required, remains a maintainer action.

No physical FP400, Home Assistant installation or coordinator was used or modified. Tests run with Node 22.20.0 and the repository's pinned dependencies. No hardware validation is claimed.
