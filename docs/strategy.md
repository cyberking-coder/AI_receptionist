# AI Voice Receptionist — Build & Go-to-Market Strategy

## 1. What we're building

An AI phone agent that answers inbound calls for a business, understands
and answers caller questions using that business's own knowledge (hours,
services, pricing, policies), books appointments, captures leads, and
hands off to a human when it's out of its depth.

## 2. Architecture

Call flow (latency budget: ~700ms round-trip end to end, or it stops
feeling natural):

1. **Telephony** — Twilio Voice / Telnyx / Vonage receives the call and
   streams audio in both directions.
2. **Speech-to-Text** — Deepgram or AssemblyAI, streaming mode, for
   real-time transcription of the caller.
3. **LLM brain** — Claude (Sonnet for quality, Haiku for cheap/fast
   turns) generates the reply. This is the "answer every question" layer:
   - **RAG**: embed the business's FAQs, service list, pricing, hours,
     and policies into a vector store (Pinecone / Weaviate / pgvector).
   - Retrieve relevant chunks per caller question, feed them to Claude
     with a system prompt that defines persona, tone, scope, and
     escalation rules.
   - If the answer isn't in the knowledge base: offer to take a message
     or transfer to a human — never guess at prices, medical/legal
     advice, or policy.
4. **Text-to-Speech** — ElevenLabs / Cartesia / Deepgram Aura, streaming,
   for natural low-latency voice output.
5. **Orchestration** — interruption/barge-in handling, silence detection,
   and tool-calling: check calendar availability and book (Google
   Calendar / Calendly API), log leads to a CRM, transfer to a human
   line.

### Build paths

- **Fast path (MVP/validation)**: use a voice-AI platform (Vapi, Retell
  AI, Bland AI, or open-source Vocode) that already handles STT/LLM/TTS
  orchestration and telephony. Plug in Claude + a per-client knowledge
  base and integrations. Working demo in days.
- **Full-control path (post-validation)**: build the pipeline directly
  on Twilio Media Streams for full customization, no per-minute platform
  markup, and a real moat. Worth doing once there's proven demand.

Start on the fast path to prove the model works before investing in the
custom stack.

### Non-negotiables

- Call-recording disclosure (and compliance with local consent laws —
  TCPA in the US, GDPR in the EU, plus any industry-specific rules like
  HIPAA for healthcare clients).
- A clean, reliable escalation-to-human path.
- Logging every unanswered/low-confidence question so the knowledge base
  keeps improving per client.

## 3. Go-to-market

### Positioning

Pick a **vertical**, not a horizontal product. "AI voice agent" is a
commodity; "AI receptionist for dental clinics" (or HVAC, law firms,
salons, property managers, auto repair) is sellable because the FAQ set,
booking integration, and objection handling can be pre-built for that
specific business type.

### The hook

Lead with missed-call cost: most SMBs lose leads to calls that go
unanswered after hours or during busy periods. Quantify it — "you're
missing roughly X calls/week, each worth roughly $Y" — as the opener.

### Pricing

Flat monthly per location is easier to sell to SMBs than raw
usage-based pricing, even if usage is metered internally.

| Tier       | Includes                                      | Price/mo   |
|------------|------------------------------------------------|-----------|
| Starter    | FAQ answering, message-taking                  | $299–$499 |
| Pro        | + appointment booking, CRM/lead sync            | $599–$999 |
| Enterprise | + multi-location, custom integrations, SLA      | Custom    |

Plus a one-time setup fee to cover knowledge-base build and integration
work per client.

### Sales motion

- Direct outreach to owners in the chosen vertical (cold email/LinkedIn/
  call).
- **Live demo**: have the prospect call their own future AI-answered
  number during the pitch. This converts far better than a deck.
- Referral partnerships with local agencies, CRM vendors, and industry
  associations already serving that vertical.
- Case studies quantifying missed-call reduction and leads captured once
  the first few clients are live.

### Differentiation

Vapi/Retell/Bland are developer tools anyone can wire up. The moat is
the done-for-you setup, the vertical-specific knowledge base, ongoing
tuning based on real call logs, and account support — not the
underlying model or platform.

## 4. Rollout plan

1. Pick one vertical and build a solid knowledge base + booking
   integration for it.
2. Ship 3–5 pilot clients on the fast-path stack (Vapi/Retell + Claude),
   priced at Starter/Pro tiers, to validate willingness to pay and
   collect real call transcripts.
3. Use pilot call logs to harden the knowledge base, escalation rules,
   and objection handling.
4. Decide whether to migrate to the full-control stack based on margin
   pressure from platform fees vs. call volume.
5. Expand to a second vertical once the playbook (KB template, demo
   script, pricing) is repeatable.
