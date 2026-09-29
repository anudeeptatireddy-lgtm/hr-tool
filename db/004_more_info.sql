-- "Ask for more detail": a decision and an email type for short or unclear CVs.
alter table decisions drop constraint if exists decisions_decision_check;
alter table decisions add constraint decisions_decision_check check (decision in ('advance', 'decline', 'hold', 'more_info'));
alter table emails drop constraint if exists emails_kind_check;
alter table emails add constraint emails_kind_check check (kind in ('invite', 'decline', 'more_info'));
