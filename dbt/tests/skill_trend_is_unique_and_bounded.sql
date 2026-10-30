-- A singular test: it passes when this query returns no rows.
-- Catches a duplicated (week, skill) pair, and a skill counted in more postings than
-- the week had, which would mean the join fanned out.
select week_start, skill, postings, total_postings
from {{ ref('skill_trend') }}
where postings > total_postings
   or (week_start, skill) in (
        select week_start, skill from {{ ref('skill_trend') }}
        group by week_start, skill having count(*) > 1
   )
