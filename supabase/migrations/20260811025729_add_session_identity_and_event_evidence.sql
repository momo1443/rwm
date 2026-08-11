-- Separate a stable participant identity from each immutable study attempt.
alter table public.participant_results
  add column session_id uuid default gen_random_uuid();

update public.participant_results
set session_id = gen_random_uuid()
where session_id is null;

alter table public.participant_results
  alter column session_id set not null;

alter table public.participant_result_events
  add column session_id uuid;

update public.participant_result_events as event
set session_id = result.session_id
from public.participant_results as result
where event.participant_code = result.participant_code;

alter table public.participant_result_events
  alter column session_id set not null,
  drop constraint participant_result_events_participant_code_fkey,
  drop constraint participant_result_events_participant_code_sequence_number_key;

alter table public.participant_results
  drop constraint participant_results_pkey,
  add constraint participant_results_pkey primary key (session_id);

create index participant_results_participant_code_idx
  on public.participant_results(participant_code, created_at desc);

alter table public.participant_result_events
  add constraint participant_result_events_session_id_fkey
    foreign key (session_id) references public.participant_results(session_id) on delete cascade,
  add constraint participant_result_events_session_sequence_key
    unique (session_id, sequence_number);

create index participant_result_events_session_idx
  on public.participant_result_events(session_id, sequence_number);
