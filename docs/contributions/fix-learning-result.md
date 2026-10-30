# fix(card): wait for a fresh learning result instead of a cleared timestamp

Starting another room-learning run clears the previous timestamp to unknown. The card previously treated that change as completion. Require a fresh valid timestamp, result_received state and a byte result code, handle results arriving during command acknowledgement, and expire an unanswered request after 30 seconds. Present the raw result code without assigning an unverified success meaning.

Tested commit `76f86228af10b5ab240a164d80fe1c97a2dce52c`: 87/87 unit tests; browser X scenario 12/12 assertions. Includes first-run, retained/cleared/invalid timestamps, immediate results, timeout and command failure.

No physical FP400, Home Assistant installation or coordinator was used or modified. Tests run with Node 22.20.0 and the repository's pinned dependencies. No hardware validation is claimed.
