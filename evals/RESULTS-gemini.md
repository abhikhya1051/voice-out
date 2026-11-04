# Eval results (Gemini)

13 cases · `gemini-3.1-flash-lite` (free tier) · run on November 3, 2026 with `npm run eval`.

| | Result |
| --- | --- |
| Fillers cut | 83% (90/109) |
| Meaningful words kept | 100% (6/6) |
| Facts kept | 100% (55/55) |
| Dates worked out correctly | 100% (7/7) |
| Facts invented | 0 |

## Console output

For every case that didn't pass outright, the runner prints which expected cuts were left in, then the kept words and the note the model wrote, so each miss can be judged. In this run, every miss was a word left unstruck in the transcript; every note was clean.

```
Running evals with gemini (gemini-3.1-flash-lite)

everyday-memo          ⚠ left in: we And I need
                       kept: I was thinking, for the Henderson project we should probably move the demo to Thursday because, Priya's out Tuesday. And I need I need to email Marcus about the budget numbers, by tomorrow.
                       note: I was thinking for the Henderson project we should probably move the demo to Thursday because Priya's out Tuesday. I need to email Marcus about the budget numbers by tomorrow.
self-correction-day    ✓
like-as-a-verb         ✓
negation               ✓
spelled-numbers        ✓
false-start            ⚠ left in: I need
                       kept: I need I need to pick up the dry cleaning before six.
                       note: I need to pick up the dry cleaning before six.
journal-feelings       ✓
meeting-time           ✓
kind-of-meaningful     ⚠ left in: so
                       kept: What kind of tea do we have left? I think we're out of green tea, so add it to the list.
                       note: What kind of tea do we have left? I think we're out of green tea, so add it to the list.
gang-meetup            ✓
party-planning         ⚠ left in: and they have to plan for Leila's birthday party.
                       kept: this is a test. Adam and Priya have to meet on They'll be meeting on Friday because Adam's got a play practice on Thursday and they have to plan for Leila's birthday party. They have to plan for Leila's graduation day party. They're throwing a huge surprise in Adam's backyard. they have to decide the theme of the party and how many people to invite. this has to be decided ASAP on Friday and the invites should be sent out the next day.
                       note: This is a test. Adam and Priya have to meet on Friday because Adam's got a play practice on Thursday and they have to plan for Leila's graduation day party. They're throwing a huge surprise in Adam's backyard. They have to decide the theme of the party and how many people to invite. This has to be decided on Friday and the invites should be sent out the next day.
relative-dates         ⚠ left in: and Oh, and
                       kept: the proposal is due tomorrow, and the review is next Friday, and then we present it the day after. Oh, and I'm out the day after tomorrow.
                       note: The proposal is due tomorrow, and the review is next Friday, and then we present it the day after. Oh, and I'm out the day after tomorrow.
number-correction      ✓

13 cases · gemini · gemini-3.1-flash-lite
fillers cut   83% (90/109)
meaning kept  100% (6/6)
facts kept    100% (55/55)
dates right   100% (7/7)
invented      0
```

Two of the misses are arguably stricter labels than the meaning: "so" in "we're out of green tea, so add it to the list" means *therefore*, and the "and" in "and the review is next Friday" joins two real clauses.
