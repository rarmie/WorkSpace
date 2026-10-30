-- One row per posting that has requirement bullets, with the Monday of the week it was
-- first seen. Postings without bullets are left out: they would only dilute every
-- skill's share. "firstSeenAt" has no time zone and holds UTC, so no conversion is needed.
select
    source,
    "sourceId" as source_id,
    date_trunc('week', "firstSeenAt")::date as week_start
from {{ source('app', 'discovered_posting') }}
where cardinality(requirements) > 0
