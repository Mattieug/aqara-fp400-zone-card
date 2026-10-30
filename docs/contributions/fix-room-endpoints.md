# fix(converter): isolate room attributes from child endpoint reports

Child endpoint activity/configuration/count attributes could overwrite room state. Restrict global converters to endpoint 1, including named and numeric cluster aliases. Zone messages remain available to the zone-specific converters.

Tested commit `ee7c177b8e3e4423294cf27db31dc228f686a170`: 90/90 unit tests, with positive room reports and negative child-endpoint cases. This independent main-branch fix also prevents child activity leaking through PR #9's AttributeSync delegation after integration.

No physical FP400, Home Assistant installation or coordinator was used or modified. Tests run with Node 22.20.0 and the repository's pinned dependencies. No hardware validation is claimed.
