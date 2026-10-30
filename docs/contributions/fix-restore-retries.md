# fix(restore): retry partial failures and serialize restoration with setting writes

A partially failed restoration was marked checked and never retried. Track restored, transiently failed and explicitly unsupported attributes, retry transient failures after 10/30/60/300 seconds in the existing loop, and restart checking on device announcement. Put user scalar writes and restoration on the same per-device queue. Surface restore_status/restore_error and local persistence failures instead of reporting an unconfirmed save as complete.

Tested commit `90597b2834f9911927d24caf2526bb002f2159fa`: 89/89 unit tests. Regressions cover partial failure/retry, unsupported-attribute classification, queue ordering, announcement and persistence failure. Explicit unsupported statuses are 0x86/0xc3; missing replies and network errors remain retryable.

No physical FP400, Home Assistant installation or coordinator was used or modified. Tests run with Node 22.20.0 and the repository's pinned dependencies. No hardware validation is claimed.
