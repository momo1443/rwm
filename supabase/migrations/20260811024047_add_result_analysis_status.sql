alter table public.participant_results
  add column if not exists analysis_status text not null default 'included'
    check (analysis_status in ('included', 'excluded', 'trashed')),
  add column if not exists exclusion_reason text,
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz;

create index if not exists participant_results_analysis_status_idx
  on public.participant_results(analysis_status, created_at desc);
