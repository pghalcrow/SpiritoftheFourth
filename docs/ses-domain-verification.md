# SES domain verification

SES sending is currently configured in `us-east-1`.

During testing, Lambda sends from the verified SES domain sender `no-reply@spiritofthefourth.org` and redirects all outbound recipients to `pghalcrow@gmail.com` with `EMAIL_OVERRIDE_TO`.

Add these DNS records for production domain sending from `spiritofthefourth.org`.

| Purpose | Type | Name | Value |
| --- | --- | --- | --- |
| SES domain verification | TXT | `_amazonses.spiritofthefourth.org` | `RlDPb0O5x8tWP/Vfmz1iOsvg3cOGkRVqTeoBxRCGkIs=` |
| DKIM | CNAME | `cz2ha2roddfxyia4mkpirzc7fmymxjwa._domainkey.spiritofthefourth.org` | `cz2ha2roddfxyia4mkpirzc7fmymxjwa.dkim.amazonses.com` |
| DKIM | CNAME | `rpo5qgkwi6nwnwoqifxwchk63lb3axoj._domainkey.spiritofthefourth.org` | `rpo5qgkwi6nwnwoqifxwchk63lb3axoj.dkim.amazonses.com` |
| DKIM | CNAME | `ggm5rusoq6kxzhdroukzcq2gvikov3bt._domainkey.spiritofthefourth.org` | `ggm5rusoq6kxzhdroukzcq2gvikov3bt.dkim.amazonses.com` |
| Custom MAIL FROM MX | MX | `mail.spiritofthefourth.org` | `10 feedback-smtp.us-east-1.amazonses.com` |
| Custom MAIL FROM SPF | TXT | `mail.spiritofthefourth.org` | `v=spf1 include:amazonses.com ~all` |
| DMARC | TXT | `_dmarc.spiritofthefourth.org` | `v=DMARC1; p=none; rua=mailto:pghalcrow@gmail.com` |

For go-live, keep Lambda `SES_SOURCE_EMAIL` on the production domain sender and remove `EMAIL_OVERRIDE_TO`.
