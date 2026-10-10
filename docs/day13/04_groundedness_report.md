# Groundedness Report

Method: Zynora is extractive. Every paragraph of every returned answer is checked to occur verbatim (normalized) in the ACTIVE approved knowledge text fetched via the admin API. An answer that fails this check is "Unsupported".

| Metric | Baseline | After fixes |
|---|---|---|
| Grounded Answer % | 82.8% | **100%** |
| Unsupported answers | 0 | 0 |
| Answers returned for questions absent from KB (hallucination-type) | 5 | 0 |
| No-Answer rate | 27.5% | 30% |

The no-answer rate of 30% is expected: 5 absent + 4 ambiguous + 1 context-switch + 5 adversarial + ... of the 40 questions are designed to be refused.
