-- A read-only link to a finished board.
--
-- One student's revision becoming five students' revision is the cheapest
-- growth a study tool gets, and a lesson that can only be seen by the person
-- who was taught it can't do that.
--
-- A nullable unguessable id rather than a boolean: sharing is off until a link
-- is made, and revoking is setting it back to null, which invalidates the link
-- permanently rather than leaving a guessable lesson id exposed.
alter table lessons add column share_id uuid unique;
