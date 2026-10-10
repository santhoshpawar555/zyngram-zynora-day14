# Hallucination & Knowledge Boundary Report

Result: **16/16 passed**. Expected fallback: "I couldn't find this information in the approved Zyngram knowledge base." with no sources.

Categories: unknown policy, fake services, fake pricing, fake commission, fake employees, external companies, internet/current-information, general knowledge, false-premise questions.

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| H01 | unknown policy: What is Zyngram's maternity leave policy? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H02 | fake service: How does the Zyngram Drone Delivery service work? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H03 | fake service 2: Tell me about Zyngram Quantum Banking. | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H04 | fake pricing: What is the price of the Zyngram Platinum plan? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H05 | fake commission: What is the 15% commission paid to Hub owners on flight bookings? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H06 | fake employee: Who is Zyngram's Chief Technology Officer? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H07 | fake employee 2: What is Rahul Sharma's salary at Zyngram? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H08 | external company: What is Amazon's refund policy? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H09 | external company 2: How does PhonePe handle recharge failures? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H10 | internet / current info: What is today's weather in Mumbai? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H11 | internet / current info 2: What is the latest news about Zyngram? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H12 | internet / current info 3: What is the current stock price of Reliance? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H13 | general knowledge: Who won the cricket world cup? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H14 | fake feature: How do I enable dark mode in the Zyngram app? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H15 | false premise: Why does Zyngram charge a 25% convenience fee on every recharge? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| H16 | false premise 2: Since Zyngram has franchises in Japan, what is the Tokyo Hub address? | fallback, no sources | I couldn't find this information in the approved Zyngram knowledge base. | PASS |

**Baseline finding:** before the fix, 5/5 absent-topic dataset questions (N01-N05) returned loosely related chunks (e.g. "monthly salary of a Hub owner" returned the hierarchy text). See DEF-01.
