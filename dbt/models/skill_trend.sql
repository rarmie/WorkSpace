-- How many postings name each skill, per week the posting was first seen.
-- `total_postings` is that week's postings with bullets, so postings / total_postings
-- is the share and stays comparable across weeks.
with totals as (
    select week_start, count(*) as total_postings
    from {{ ref('posting_week') }}
    group by week_start
),

counts as (
    select
        posting_week.week_start,
        posting_skill.skill,
        count(*) as postings
    from {{ ref('posting_week') }} as posting_week
    join {{ source('staging', 'posting_skill') }} as posting_skill
        on posting_skill.source = posting_week.source
        and posting_skill.source_id = posting_week.source_id
    group by posting_week.week_start, posting_skill.skill
)

select
    counts.week_start,
    counts.skill,
    counts.postings,
    totals.total_postings
from counts
join totals using (week_start)
