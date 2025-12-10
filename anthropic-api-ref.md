# Anthropic Claude API Reference (Claude 4.5 – Messages API)

This document is a complete reference for working with **Anthropic Claude 4.5 models** using the **Messages API**, including model identifiers, setup, usage patterns, and vision support.

---

## Claude 4.5 Model Identifiers (Authoritative)

### ✅ Recommended: Claude API Aliases  
Use these in most applications. They automatically point to the latest stable model version.

- `claude-sonnet-4-5`
- `claude-haiku-4-5`
- `claude-opus-4-5`

---

### 🔒 Version-Pinned Claude API IDs  
Use these when you need strict reproducibility or version pinning.

- **Claude Sonnet 4.5**
  - `claude-sonnet-4-5-20250929`

- **Claude Haiku 4.5**
  - `claude-haiku-4-5-20251001`

- **Claude Opus 4.5**
  - `claude-opus-4-5-20251101`

---

### ☁️ AWS Bedrock Model IDs

- **Claude Sonnet 4.5**
  - `anthropic.claude-sonnet-4-5-20250929-v1:0`

- **Claude Haiku 4.5**
  - `anthropic.claude-haiku-4-5-20251001-v1:0`

- **Claude Opus 4.5**
  - `anthropic.claude-opus-4-5-20251101-v1:0`

---

### ☁️ GCP Vertex AI Model IDs

- **Claude Sonnet 4.5**
  - `claude-sonnet-4-5@20250929`

- **Claude Haiku 4.5**
  - `claude-haiku-4-5@20251001`

- **Claude Opus 4.5**
  - `claude-opus-4-5@20251101`

---

### ✅ Best Practice
- Use **API aliases** unless you need strict version pinning.
- Use **dated IDs** for audits, benchmarks, or regulated environments.
- AWS Bedrock and GCP Vertex **require** their platform-specific IDs.

---

## Model Overview

| Model | Description | Context Window | Max Output | Latency | Pricing (Input / Output) |
|------|------------|----------------|------------|---------|--------------------------|
| Claude Sonnet 4.5 | Smart model for complex agents and coding | 200K tokens (1M beta) | 64K | Fast | $3 / $15 per MTok |
| Claude Haiku 4.5 | Fastest model, near-frontier intelligence | 200K tokens | 64K | Fastest | $1 / $5 per MTok |
| Claude Opus 4.5 | Maximum intelligence, premium reasoning | 200K tokens | 64K | Moderate | $5 / $25 per MTok |

---

## Prerequisites

- Anthropic Console account
- Anthropic API key

---

## Authentication

Set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

---

## SDK Installation (TypeScript)

bash  
Copy code

```bash
npm install @anthropic-ai/sdk
```

---

## Quickstart (TypeScript)

quickstart.ts  
ts  
Copy code

```ts
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const anthropic = new Anthropic();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: "What should I search for to find the latest developments in renewable energy?"
      }
    ]
  });

  console.log(message);
}

main().catch(console.error);
```

Run:

bash  
Copy code

```bash
npx tsx quickstart.ts
```

---

## Messages API

The Messages API is stateless. Every request must include the full conversation history.

### Basic Request

ts  
Copy code

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const message = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Hello, Claude" }
  ]
});

console.log(message);
```

### Multi-Turn Conversation

ts  
Copy code

```ts
await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Hello, Claude" },
    { role: "assistant", content: "Hello!" },
    { role: "user", content: "Can you describe LLMs to me?" }
  ]
});
```

### Response Prefill (Shaping Output)

You can prefill Claude’s response by including assistant text as the final message.

ts  
Copy code

```ts
const message = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1,
  messages: [
    {
      role: "user",
      content: "What is Latin for ant? (A) Apoidea, (B) Rhopalocera, (C) Formicidae"
    },
    {
      role: "assistant",
      content: "The answer is ("
    }
  ]
});
```

---

## Vision (Image + Text)

Claude supports image understanding using base64 or URL sources.

Supported formats:

- image/jpeg
- image/png
- image/gif
- image/webp

### Vision – Base64 Image

ts  
Copy code

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const imageUrl =
  "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg";

const imageBuffer = await (await fetch(imageUrl)).arrayBuffer();
const imageBase64 = Buffer.from(imageBuffer).toString("base64");

const message = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: imageBase64
          }
        },
        {
          type: "text",
          text: "What is in this image?"
        }
      ]
    }
  ]
});

console.log(message);
```

### Vision – Image via URL

ts  
Copy code

```ts
const message = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "url",
            url: "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg"
          }
        },
        {
          type: "text",
          text: "What is in this image?"
        }
      ]
    }
  ]
});
```

---

## Key Notes

- Always send the full conversation state
- Prefer model aliases unless version pinning is required
- Control output size with max_tokens
- Image tokens count toward usage
- Responses include token usage for billing and optimization

---

## Recommended Defaults

- Model: claude-sonnet-4-5
- Max Tokens: 1024–4096
- Haiku: latency-critical tasks
- Opus: highest-stakes reasoning and analysis