# Multi-Turn Context Report

Result: **13/13 passed**. Covers follow-ups, context switching, 25-turn conversation, new conversation (no memory), continuing a previous conversation, deleted conversation, and cross-user leakage. Dataset: 10 context questions, 10/10 correct (baseline 7/10).

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| M01 | contextual follow-up | Command | Zyngram's physical, real-world franchise structure has five levels, from smallest to largest: Point, Center, Hub, Command, and Headquarters (HQ). | PASS |
| M02 | context switch: new topic answered from its own doc | source = Working Hours | Working Hours and Support Policy | PASS |
| M03 | follow-up after switch uses the NEW topic | 24 hours (support/recharge) | Zyngram's internal support desk for franchise owners is available from 9 AM to 7 PM, Monday through Saturday. Customer-facing automated services such  | PASS |
| M04 | 25-turn conversation stays correct (grounded/refusal alternate) | all 25 correct | true | PASS |
| M05 | long conversation history stored completely | 50 messages | 50 | PASS |
| M06 | new conversation has no previous context | no answer about HQ derived from context | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| M07 | previous conversation can be continued | Command | Anyone can apply to own a Point, Center, Hub, or Command franchise. An application is reviewed by Zyngram admin staff before being approved - not ever | PASS |
| M08 | chat into deleted conversation rejected | 404 | 404 | PASS |
| M09 | deleted conversation history gone | 404 | 404 | PASS |
| M10 | no context leakage: user B's follow-up in B's own conversation is not enriched by user A | usedContext=false | false | PASS |
| M11 | user B cannot chat in user A's conversation | 403 | 403 | PASS |
| M12 | user B cannot read user A's history | 403 | 403 | PASS |
| M13 | user B's list excludes A's conversations | none of A's ids | 3 convs | PASS |
