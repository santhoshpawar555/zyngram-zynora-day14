# RAG Retrieval Test Report

Result: **14/14 passed**. Covers correct document/chunk, irrelevant chunk exclusion, multiple relevant docs, no matching doc, duplicate chunks, version conflict, draft / approved / edited / archived / deleted documents. Only ACTIVE_IN_RAG (newest version per title) is retrievable.

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| R01 | correct document retrieved | source = Working Hours and Support Policy | Working Hours and Support Policy | PASS |
| R02 | correct chunk retrieved (contains the hours) | answer has 9 AM to 7 PM | Zyngram's internal support desk for franchise owners is available from 9 AM to 7 PM, Monday through Saturday. Customer-facing automated services such  | PASS |
| R03 | irrelevant chunks excluded | no hierarchy/commission sources | Working Hours and Support Policy | PASS |
| R04 | multiple relevant documents can contribute | >=1 source among Refund/FAQ/Recharge, grounded | Frequently Asked Questions - General | PASS |
| R05 | no matching document -> fallback, no sources | refusal | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| R06 | duplicate chunks are not repeated in one answer | no identical paragraph twice | 3 paragraphs, 3 unique | PASS |
| R07 | version conflict: superseded v1 of same title is never served | no 'Refund Policy' v1 source; v2 text present | Frequently Asked Questions - General,Refund Policy / ["v1","v2"] | PASS |
| R08 | version conflict: source shows version | sources[].version = v2 | ["v1","v2"] | PASS |
| R09 | DRAFT document never retrieved | refusal | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| R10 | APPROVED (not active) never retrieved | refusal | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| R11 | ACTIVE document retrieved with source | grounded + source | Quokka Allowance | PASS |
| R12 | EDITED document returns to DRAFT and leaves retrieval until re-approved | refusal | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| R13 | ARCHIVED document removed from retrieval | refusal | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| R14 | DELETED document removed from retrieval | refusal | I couldn't find this information in the approved Zyngram knowledge base. | PASS |

**Retrieval success on the 24 answerable dataset questions: 100%** (baseline 83.3%).
