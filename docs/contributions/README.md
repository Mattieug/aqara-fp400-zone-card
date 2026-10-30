# Submitted contributions

Seven contributions were submitted on 30 October 2026 from [Mattieug's fork](https://github.com/Mattieug/aqara-fp400-zone-card). All seven pull requests were verified open, targeting main, with their head commits matching the separately tested branches. They are proposed changes awaiting maintainer review.

| Change | Pull request | Tested commit | Description |
| --- | --- | --- | --- |
| Renamed settings | [bobtekkk #10](https://github.com/bobtekkk/aqara-fp400-zone-card/pull/10) | `2a09297` | [Description](fix-renamed-settings.md) |
| Fresh learning results | [bobtekkk #11](https://github.com/bobtekkk/aqara-fp400-zone-card/pull/11) | `76f8622` | [Description](fix-learning-result.md) |
| Conservative absence confirmation | [bobtekkk #12](https://github.com/bobtekkk/aqara-fp400-zone-card/pull/12) | `51108d4` | [Description](fix-partial-presence.md) |
| Room/child endpoint isolation | [bobtekkk #13](https://github.com/bobtekkk/aqara-fp400-zone-card/pull/13) | `ee7c177` | [Description](fix-room-endpoints.md) |
| Partial restoration retries and serialization | [bobtekkk #14](https://github.com/bobtekkk/aqara-fp400-zone-card/pull/14) | `90597b2` | [Description](fix-restore-retries.md) |
| Browser validation in CI | [bobtekkk #15](https://github.com/bobtekkk/aqara-fp400-zone-card/pull/15) | `5337280` | [Description](ci-browser-tests.md) |
| Native reporting-slot reallocation | [makleso6 #1](https://github.com/makleso6/aqara-fp400-zone-card/pull/1) | `43e3a66` | [Description](fix-native-reporting.md) |

The six Validate runs in the original repository initially report `action_required`; upstream automated validation has not run successfully yet. This is separate from the local branch tests and the successful integration workflow on the fork. The native-reporting PR had no pull-request workflow run at verification time. See [validation and hardware follow-up](../validation-and-hardware.md) for the software evidence and limitations.

The native-reporting PR targets makleso6, the author of upstream PR #9, whose main is f3b25bd at submission time. It can be incorporated into #9 or adapted after #9 merges. Other branches are independent of #7/#9 and target the original project's main at c498f5b.

The [development integration draft](https://github.com/Mattieug/aqara-fp400-zone-card/pull/1) combines upstream #7 followed by #9 and all extensions. It remains separate while those dependencies and hardware checks are pending. The original maintainer's merge order is preserved.
